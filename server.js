// JIG LOG × 海上保安庁「海しる」API v3
// Node.js 18+ / Express 5+
//
// 公開版ではAPIキーをブラウザに置かず、サーバー側の環境変数で管理します。
//
// 必須:
//   MSIL_API_KEY=あなたの海しるAPIキー
//   MSIL_TIDE_SERVICE_URL=海しるv3の潮流推算FeatureServer URL
// 任意:
//   MSIL_TIDE_LAYER_ID=0  (未指定ならレイヤー名から自動選択)
//   PORT=3000
//
// 海しるv3はArcGIS FeatureService方式です。公式ポータルではv3ベータが2026-08-27に開始され、
// APIのエンドポイントは https://api.msil.go.jp/、HTTP GET、JSON/GeoJSON等を使用します。
// 潮流推算は「日本沿岸の潮流の推算値」です。

const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.MSIL_API_KEY || '';
const SERVICE_URL = process.env.MSIL_TIDE_SERVICE_URL || '';
const FIXED_LAYER_ID = process.env.MSIL_TIDE_LAYER_ID || '';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function apiHeaders() {
  return { 'Ocp-Apim-Subscription-Key': API_KEY };
}

function cleanUrl(u) {
  return String(u || '').trim().replace(/\/$/, '');
}

function pickField(fields, patterns) {
  const names = (fields || []).map(f => ({ name: f.name, alias: f.alias || '' }));
  for (const p of patterns) {
    const re = new RegExp(p, 'i');
    const hit = names.find(x => re.test(x.name) || re.test(x.alias));
    if (hit) return hit.name;
  }
  return null;
}

function msToJstDate(date, time) {
  // 入力は日本時間。ArcGISのdateはミリ秒で返るため、ここでは比較用Dateを作る。
  return new Date(`${date}T${time}:00+09:00`);
}

function normalizeDirection(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (Number.isFinite(n)) {
    const dirs = ['北','北東','東','南東','南','南西','西','北西'];
    return dirs[Math.round(((n % 360) + 360) % 360 / 45) % 8];
  }
  return String(v);
}

function normalizeSpeed(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function makeResult(feature, meta, requested) {
  const a = feature.attributes || {};
  const geom = feature.geometry || {};
  const dir = meta.directionField ? a[meta.directionField] : null;
  const speed = meta.speedField ? a[meta.speedField] : null;
  const timeValue = meta.timeField ? a[meta.timeField] : null;

  return {
    direction: normalizeDirection(dir),
    directionRaw: dir,
    speed: normalizeSpeed(speed),
    speedUnit: meta.speedUnit || 'kn',
    state: meta.stateField ? (a[meta.stateField] ?? '-') : '-',
    nextTurn: meta.nextTurnField ? (a[meta.nextTurnField] ?? '-') : '-',
    predictionTime: timeValue,
    source: '海上保安庁 海しるAPI v3 / 潮流推算',
    area: requested.area,
    requestedDate: requested.date,
    requestedTime: requested.time,
    layerId: meta.layerId,
    feature: a,
    geometry: geom
  };
}

async function msilGet(url) {
  const r = await fetch(url, { headers: apiHeaders() });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.error?.message || data?.message || `海しるAPI HTTP ${r.status}`;
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return data;
}

async function resolveLayer() {
  if (!SERVICE_URL) throw new Error('MSIL_TIDE_SERVICE_URL が未設定です。');
  const base = cleanUrl(SERVICE_URL);
  if (FIXED_LAYER_ID !== '') return { id: FIXED_LAYER_ID, url: `${base}/${FIXED_LAYER_ID}` };

  const root = await msilGet(`${base}?f=json`);
  const layers = root.layers || [];
  if (!layers.length) return { id: '', url: base };

  const hit = layers.find(x => /潮流|瀬戸内|tidal|current/i.test(`${x.name}`));
  const chosen = hit || layers[0];
  return { id: String(chosen.id), url: `${base}/${chosen.id}` };
}

async function queryTidalCurrent({ area, date, time }) {
  const layer = await resolveLayer();
  const info = await msilGet(`${layer.url}?f=json`);
  const fields = info.fields || [];

  // 海しるの属性名変更に備え、フィールド名/aliasを実行時に判定する。
  const timeField = pickField(fields, [
    '時刻','日時','時間','date','time','timestamp','datetime','予測時刻','推算時刻','観測日時'
  ]);
  const directionField = pickField(fields, ['流向','方向','direction','dir','向き']);
  const speedField = pickField(fields, ['流速','速度','speed','vel','kn']);
  const stateField = pickField(fields, ['状態','state','status','転流']);
  const nextTurnField = pickField(fields, ['次回転流','転流時刻','next.*turn','slack']);

  const target = msToJstDate(date, time);
  const targetMs = target.getTime();

  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    resultRecordCount: '1000'
  });

  // エリアはUI上の代表地点。厳密な航行位置ではなく釣果記録用の代表値として扱う。
  const points = {
    '明石海峡': [134.830, 34.615],
    '友ヶ島水道': [134.970, 34.270],
    '鳴門海峡': [134.650, 34.230],
    '備讃瀬戸': [133.950, 34.350],
    '来島海峡': [132.950, 34.100]
  };
  const [x,y] = points[area] || points['明石海峡'];
  params.set('geometry', JSON.stringify({ x, y, spatialReference: { wkid: 4326 } }));
  params.set('geometryType', 'esriGeometryPoint');
  params.set('inSR', '4326');
  params.set('spatialRel', 'esriSpatialRelIntersects');
  params.set('distance', '15000');
  params.set('units', 'esriSRUnit_Meter');

  // 時刻フィールドが分かる場合は、その日付付近に絞る。
  if (timeField) {
    const start = new Date(targetMs - 3 * 60 * 60 * 1000).toISOString().slice(0,19).replace('T',' ');
    const end = new Date(targetMs + 3 * 60 * 60 * 1000).toISOString().slice(0,19).replace('T',' ');
    params.set('where', `(${timeField} >= DATE '${start}' AND ${timeField} <= DATE '${end}')`);
  }

  const data = await msilGet(`${layer.url}/query?${params.toString()}`);
  const features = data.features || [];
  if (!features.length) throw new Error('指定したエリア・日時の潮流推算データが見つかりませんでした。');

  function featureTime(f) {
    if (!timeField) return Infinity;
    const v = f.attributes?.[timeField];
    const n = Number(v);
    if (Number.isFinite(n)) return Math.abs(n - targetMs);
    const d = new Date(v).getTime();
    return Number.isFinite(d) ? Math.abs(d - targetMs) : Infinity;
  }
  features.sort((a,b) => featureTime(a) - featureTime(b));
  const chosen = features[0];

  return makeResult(chosen, {
    layerId: layer.id,
    directionField,
    speedField,
    stateField,
    nextTurnField,
    timeField,
    speedUnit: 'kn'
  }, { area, date, time });
}

app.get('/api/tide-status', (req,res) => {
  res.json({
    ok: true,
    apiKeyConfigured: Boolean(API_KEY),
    serviceConfigured: Boolean(SERVICE_URL),
    layerConfigured: Boolean(FIXED_LAYER_ID),
    source: 'Japan Coast Guard / MSIL API v3'
  });
});

app.post('/api/tidal-current', async (req,res) => {
  const { area, date, time } = req.body || {};
  if (!API_KEY) return res.status(503).json({ ok:false, reason:'API_KEY_NOT_CONFIGURED', message:'サーバーのMSIL_API_KEYが未設定です。' });
  if (!SERVICE_URL) return res.status(503).json({ ok:false, reason:'SERVICE_URL_NOT_CONFIGURED', message:'海しるv3の潮流推算FeatureServer URLが未設定です。' });
  if (!area || !date || !time) return res.status(400).json({ ok:false, message:'area/date/time が必要です。' });

  try {
    const data = await queryTidalCurrent({ area, date, time });
    res.json({ ok:true, data });
  } catch (e) {
    console.error(e);
    res.status(e.status === 401 ? 401 : 502).json({ ok:false, reason:'MSIL_API_ERROR', message:e.message || '海しるAPIから取得できませんでした。' });
  }
});

app.listen(PORT, () => console.log(`JIG LOG: http://localhost:${PORT}`));
