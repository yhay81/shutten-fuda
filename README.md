# 出店札

マルシェ、ハンドメイド、フリーマーケット、キッチンカー、ワークショップの出店募集を、締切と条件から探す公開募集札です。

<https://shutten-fuda.yhay81.com>

応募書類や連絡先を預からず、比較に必要な固定項目から元のHTTPS募集要項へ案内します。

## Development

```powershell
npm ci
npx wrangler d1 migrations apply shutten-fuda --local
npm run dev
```

## Verification

```powershell
npm run release:check
npm run check
npm test
npm run build
```
