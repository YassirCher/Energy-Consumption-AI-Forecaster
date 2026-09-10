# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, leaked credential, or sensitive deployment detail. Use GitHub's private vulnerability reporting or contact the repository owner privately through their GitHub profile.

Include the affected component, reproduction steps, potential impact, and any safe mitigation you have identified. Please avoid accessing data that is not yours, disrupting the production service, or testing third-party systems without authorization.

## Supported version

Security fixes target the latest revision on `main` and the currently deployed production revision.

## Secret handling

- Never commit `.env` files, API keys, passwords, tokens, private keys, or populated deployment parameter files.
- Use Azure Container Apps secret references for runtime credentials.
- Use short-lived GitHub OpenID Connect tokens for Azure deployment.
- Rotate a credential immediately if it is exposed in source, logs, screenshots, or issue content.

The sample local credentials documented in `README.md` are development-only defaults and must never be used for an internet-accessible deployment.
