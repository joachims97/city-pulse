/**
 * Thin wrapper around the Anthropic SDK for Claude Haiku summarization.
 * Returns null gracefully if the API key is not configured.
 */

let anthropicClient: import('@anthropic-ai/sdk').Anthropic | null = null

async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null

  if (!anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

interface SummarizeLegislationInput {
  matterTitle: string
  fullText: string
  agendaNote?: string | null
}

export function sanitizeSummaryText(value: string | null): string | null {
  if (!value) return null

  const cleaned = value
    .replace(/^\s*AI:\s*/i, '')
    .replace(/^\s*#+\s+.*?summary\s*$/im, '')
    .replace(/^\s*summary:\s*/im, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return cleaned || null
}

export async function summarizeAgendaItem({
  matterTitle,
  fullText,
  agendaNote,
}: SummarizeLegislationInput): Promise<string | null> {
  const client = await getClient()
  if (!client) return null

  try {
    const trimmedText = truncateForPrompt(fullText, 18000)
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system:
        'You are a civic transparency assistant. Summarize city council legislation in 2-3 plain English sentences for a resident. Return only the summary text with no heading, no title, no markdown, and no prefatory label. Base the summary on the legislation text provided. Be specific about what the item does, who is affected, and any dollar amounts. Avoid legal jargon and avoid speculation.',
      messages: [
        {
          role: 'user',
          content: [
            `Legislation item: ${matterTitle}`,
            agendaNote ? `Metadata:\n${agendaNote}` : null,
            `Legislation text:\n${trimmedText}`,
          ].filter(Boolean).join('\n\n'),
        },
      ],
    })

    const content = message.content[0]
    return content.type === 'text' ? sanitizeSummaryText(content.text) : null
  } catch (err) {
    console.error('[Claude] Summarization error:', err)
    return null
  }
}

function truncateForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n\n[Truncated for summarization]`
}
