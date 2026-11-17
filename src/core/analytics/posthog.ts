// Product analytics (PostHog) for the Amazon Pets ERP / POS.
// The project key is a public, write-only key (it is meant to ship in client bundles); VITE_POSTHOG_KEY overrides it.
import posthog from 'posthog-js'

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) || 'phc_mimSk5SMKxvkrV8k9DEWn5NYQATwVgtnVqshfPak3JPz'
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

if (import.meta.env.PROD && typeof window !== 'undefined' && KEY) {
  posthog.init(KEY, {
    api_host: HOST,
    // SPA-aware pageviews/pageleaves on client-side route changes.
    defaults: '2025-05-24',
    person_profiles: 'identified_only',
    // Internal system full of customer data (names, phones, amounts): replays show layout and clicks only —
    // every input and every piece of text is masked.
    session_recording: { maskAllInputs: true, maskTextSelector: '*' },
  })
}

export { posthog }
