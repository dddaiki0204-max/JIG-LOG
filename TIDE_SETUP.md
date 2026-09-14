# JIG LOG 海しるAPI v3設定

## 重要
JIG LOGはブラウザへAPIキーを埋め込まず、Node.jsサーバーから海しるAPI v3へアクセスする構成です。

海しるAPI v3は2026年8月27日にベータ版が提供開始され、ArcGIS FeatureService方式です。公式ポータルではAPI利用にサブスクリプションキーが必要で、試用キーも案内されています。

## 1. APIキー
海しる公式「利用方法」から試用キーまたは個別発行キーを取得します。

## 2. FeatureServer URL
海しる公式の「APIs」→「ArcGIS FeatureService_ベータ版 - v3」から、潮流推算のFeatureServer URLを確認して `.env` の `MSIL_TIDE_SERVICE_URL` に設定します。

この版では、公式に確認できていないURLをコードへ捏造していません。URLを設定すると、サーバーがFeatureServerのレイヤー情報を読み、潮流・瀬戸内海などの名前からレイヤーを自動選択します。

## 3. 起動

```bash
npm install
copy .env.example .env
# .env を編集
node server.js
```

ブラウザで `http://localhost:3000` を開きます。

## 4. JIG LOGでの取得

- 釣行登録：日付＋潮流エリア → 「潮流を自動取得」
- 釣果登録：ヒット時刻 → 「ヒット時潮流」を自動取得

取得データは釣行/釣果の `tideAuto` / `hitTide` に保存されます。

## 注意
潮流推算は推算値です。海上保安庁のデータは航海目的の値として使用せず、JIG LOGでは釣果記録・分析用の参考値として扱います。
