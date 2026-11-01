# ChatGPT publisher Action setup

This integration adds a ChatGPT Custom GPT Action for the existing Raisina Wire Worker API.
It does not replace or modify the Claude publisher.

## Files and safety

- OpenAPI contract: `integrations/chatgpt-action.openapi.yaml`
- API base: `https://raisinawire.calibrex.org`
- Authentication: HTTP Bearer using the existing Worker `PUBLISH_TOKEN`
- No token or credential is stored in this repository.
- The Action calls the existing Worker routes; it does not introduce a second CMS or database.

## Configure the Custom GPT

1. In ChatGPT, create a Custom GPT and open its Configure page.
2. Under Actions, choose Create new action.
3. Paste the complete contents of `integrations/chatgpt-action.openapi.yaml` into the schema editor.
4. Set Authentication to **API Key**:
   - Auth type: **Bearer**
   - API key: the existing value configured as the Worker `PUBLISH_TOKEN`
   - Do not paste the token into this repository, the schema, a prompt, or a chat message.
5. Save the Action and run the verification tests below.

The Action credential is held in the Custom GPT's Action configuration. Reusing the existing publisher token means that anyone with access to that GPT's configured Action may be able to use its publisher permissions. Keep the GPT private and share it only with trusted newsroom editors. If a separate least-privilege credential is desired later, that requires a separately approved authentication change; this setup does not create or rotate secrets.

## Suggested Custom GPT instructions

You are the Raisina Wire editorial publisher. Use the Raisina Wire Publisher Action only for the user's explicit publishing requests.

- Draft first. For articles, create with status `draft`; do not publish on the first tool call.
- Show the complete proposed headline, standfirst, kicker, category, tags, writer, body, and any image/source fields before publication.
- Publish only after the user explicitly approves the displayed final draft.
- Do not interpret "yes" to a different question as publication approval.
- Keep `notify: false` unless the user separately approves sending a reader alert. Alerts reach readers' devices.
- Live coverage must be created as a draft first. Switch it to `live` only after explicit approval.
- A live update may be posted only when the user asks to post it; leave its `notify` false unless a push alert is separately approved.
- Events publish immediately through the API. Show all event details and obtain explicit approval before calling createEvent.
- Never invent IDs, slugs, API results, or publication URLs. Report success only from the Action response.
- If authentication fails, stop and report the HTTP error. Never ask the user to paste a token into chat.
- Write original copy in Raisina Wire house style. Do not copy source text. Attribute claims and preserve source URLs in the sourceUrl field.
- For English articles and editions, prepare Hindi and Bengali versions for review, but do not claim they were saved unless the corresponding translation endpoint is added and successfully called.
- Do not alter, replace, or interfere with the Claude publishing integration.

## Acceptance tests

Run these in the Custom GPT after configuring the Action:

1. `publisherHealth`: returns `ok: true`.
2. `publisherAuthCheck`: returns HTTP 200. A 403 means the configured bearer credential does not match the Worker secret or the deployed Worker lacks the expected route.
3. `listArticles`: returns article records.
4. Create a harmless test article with `status: draft` and `notify: false`; verify it appears in the control room and public site does not show it.
5. Update the test article to `status: published` only after explicit approval; verify its public URL and status.
6. Test live coverage using a draft, then separately test status changes only with approval.
7. Verify an invalid credential receives 403.
8. Verify the Claude publishing skill remains unchanged.

Do not use a real breaking-news alert for testing. Do not delete the test story unless the editor explicitly asks.

## Scope / known limitations

- A Custom GPT Action is available when the user opens that Custom GPT. It does not automatically become available in every ordinary ChatGPT conversation.
- This repository change does not register or configure the Custom GPT in the user's ChatGPT account; the owner must complete the Action setup above.
- No live API test has been performed from this repository integration, and no claim of end-to-end readiness should be made until the acceptance tests pass.
- This integration does not change Cloudflare settings or the existing Git-to-Cloudflare deployment configuration.
