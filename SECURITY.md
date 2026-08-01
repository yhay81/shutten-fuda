# Security

Security reports: <https://github.com/yhay81/shutten-fuda/security/advisories/new>

- Editing requires an unguessable fragment capability.
- Only public HTTPS source URLs are accepted.
- Submitted fields reject embedded contact details and URLs.
- Independent reports use an HMAC network fingerprint without storing IP addresses.
- Strict CSP, same-origin writes, exact JSON shapes, body limits, and daily posting limits are enforced.
