# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | yes |
| 1.x | no |

## Reporting a vulnerability

Report it **privately**, through GitHub's private vulnerability reporting:
<https://github.com/01ecommerce/shopify-support-chat/security/advisories/new>

Never open a public issue, pull request or discussion for a vulnerability. Say which version you tested,
what you did and what happened, with placeholder values only (no real widget id, shop or email).

We aim to acknowledge a report within 5 working days and to tell you what we decided. A confirmed
vulnerability is fixed in a patch release and published as a GitHub security advisory.

## In scope

- **Injection through the inline-script path.** `supportChatScript` and `supportChatTag` build a script
  from caller-supplied values; any value that can break out of the script or the tag is a vulnerability.
- Any way the package renders the widget somewhere it was not asked to, or loads code from a host other
  than the documented Brevo widget host.
- Anything in the published tarball that should not be there (a secret, a credential, a private path).
- **Shopify launch credentials in the page address reaching the widget.** The package clears `id_token`,
  `hmac`, `session`, `timestamp` and any JWT-shaped value from the address before the widget starts, and
  loads nothing if it cannot. A way to get one of them to the widget anyway is a vulnerability.

## Not a vulnerability

- **Visitor attributes are set in the browser and are UNVERIFIED by design.** The shop, email, merchant
  name and app id are claims, not proof: a visitor can fake them, and Brevo shows `IDENTITY: UNVERIFIED`
  on every conversation. Support staff must confirm identity out of band. See the README.
- Behaviour of Brevo's own widget or service. Report that to Brevo.
- A consumer app that passes untrusted values as `shop` or `email` instead of reading them from its
  server session.
