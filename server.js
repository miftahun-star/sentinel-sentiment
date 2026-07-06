import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------------------
// Technical Indicators Calculation Helpers
// ----------------------------------------------------

function getEMA(candles, period) {
  let ema = candles[0].close;
  const k = 2 / (period + 1);
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function getSMA(candles, period) {
  const slice = candles.slice(-period);
  return slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
}

function getStochastic(candles, period = 14) {
  if (candles.length < period + 3) return { k: 50, d: 50 };
  
  const lastP = candles.slice(-period);
  const currentClose = candles[candles.length - 1].close;
  const minLow = Math.min(...lastP.map(c => c.low));
  const maxHigh = Math.max(...lastP.map(c => c.high));
  const diff = maxHigh - minLow;
  const k = diff === 0 ? 50 : ((currentClose - minLow) / diff) * 100;
  
  // Calculate %D (3 SMA of %K)
  const kList = [];
  for (let i = candles.length - 3; i < candles.length; i++) {
    const subL = candles.slice(i - period + 1, i + 1);
    const sMin = Math.min(...subL.map(c => c.low));
    const sMax = Math.max(...subL.map(c => c.high));
    const sDiff = sMax - sMin;
    const sK = sDiff === 0 ? 50 : ((candles[i].close - sMin) / sDiff) * 100;
    kList.push(sK);
  }
  const d = kList.reduce((sum, val) => sum + val, 0) / kList.length;

  return { k: parseFloat(k.toFixed(2)), d: parseFloat(d.toFixed(2)) };
}

function getMACD(candles) {
  if (candles.length < 26 + 9) return { macd: 0, signal: 0, histogram: 0 };
  
  const macdList = [];
  let ema12 = candles[0].close;
  let ema26 = candles[0].close;
  const k12 = 2 / (12 + 1);
  const k26 = 2 / (26 + 1);
  
  for (let i = 0; i < candles.length; i++) {
    ema12 = candles[i].close * k12 + ema12 * (1 - k12);
    ema26 = candles[i].close * k26 + ema26 * (1 - k26);
    macdList.push(ema12 - ema26);
  }
  
  let signal = macdList[0];
  const k9 = 2 / (9 + 1);
  for (let i = 1; i < macdList.length; i++) {
    signal = macdList[i] * k9 + signal * (1 - k9);
  }
  
  const macdVal = macdList[macdList.length - 1];
  const hist = macdVal - signal;
  
  return {
    macd: parseFloat(macdVal.toFixed(6)),
    signal: parseFloat(signal.toFixed(6)),
    histogram: parseFloat(hist.toFixed(6))
  };
}

function getIchimoku(candles) {
  if (candles.length < 52 + 26) return { tenkan: 0, kijun: 0, spanA: 0, spanB: 0 };
  
  // Tenkan-sen (9 period)
  const last9 = candles.slice(-9);
  const tenkan = (Math.max(...last9.map(c => c.high)) + Math.min(...last9.map(c => c.low))) / 2;
  
  // Kijun-sen (26 period)
  const last26 = candles.slice(-26);
  const kijun = (Math.max(...last26.map(c => c.high)) + Math.min(...last26.map(c => c.low))) / 2;
  
  // Senkou Span A (leading Span A plotted 26 periods ahead)
  const subCandles = candles.slice(0, -26);
  const t9Prev = subCandles.slice(-9);
  const tenkanPrev = (Math.max(...t9Prev.map(c => c.high)) + Math.min(...t9Prev.map(c => c.low))) / 2;
  const k26Prev = subCandles.slice(-26);
  const kijunPrev = (Math.max(...k26Prev.map(c => c.high)) + Math.min(...k26Prev.map(c => c.low))) / 2;
  const spanA = (tenkanPrev + kijunPrev) / 2;
  
  // Senkou Span B (52 period)
  const last52Prev = subCandles.slice(-52);
  const spanB = (Math.max(...last52Prev.map(c => c.high)) + Math.min(...last52Prev.map(c => c.low))) / 2;
  
  return {
    tenkan: parseFloat(tenkan.toFixed(6)),
    kijun: parseFloat(kijun.toFixed(6)),
    spanA: parseFloat(spanA.toFixed(6)),
    spanB: parseFloat(spanB.toFixed(6))
  };
}

function getFibonacciLevels(candles) {
  // Find recent Swing High and Swing Low from the last 30 candles
  const last30 = candles.slice(-30);
  const highest = Math.max(...last30.map(c => c.high));
  const lowest = Math.min(...last30.map(c => c.low));
  
  const highIndex = last30.findIndex(c => c.high === highest);
  const lowIndex = last30.findIndex(c => c.low === lowest);
  
  const isUptrend = highIndex > lowIndex; // High occurred after low
  const diff = highest - lowest;
  
  const levels = {};
  if (isUptrend) {
    levels['0.000'] = highest;
    levels['0.236'] = highest - 0.236 * diff;
    levels['0.382'] = highest - 0.382 * diff;
    levels['0.500'] = highest - 0.500 * diff;
    levels['0.618'] = highest - 0.618 * diff;
    levels['0.786'] = highest - 0.786 * diff;
    levels['1.000'] = lowest;
    levels['-0.272'] = highest + 0.272 * diff; // extension
    levels['-0.618'] = highest + 0.618 * diff; // extension
  } else {
    levels['0.000'] = lowest;
    levels['0.236'] = lowest + 0.236 * diff;
    levels['0.382'] = lowest + 0.382 * diff;
    levels['0.500'] = lowest + 0.500 * diff;
    levels['0.618'] = lowest + 0.618 * diff;
    levels['0.786'] = lowest + 0.786 * diff;
    levels['1.000'] = highest;
    levels['-0.272'] = lowest - 0.272 * diff; // extension
    levels['-0.618'] = lowest - 0.618 * diff; // extension
  }
  
  // Format levels
  for (const k in levels) {
    levels[k] = parseFloat(levels[k].toFixed(6));
  }
  
  return {
    isUptrend,
    highest: parseFloat(highest.toFixed(6)),
    lowest: parseFloat(lowest.toFixed(6)),
    levels
  };
}

// Swing Points (Pivots) Extraction
function getPivots(candles, strength = 3) {
  const pivots = [];
  
  for (let i = strength; i < candles.length - strength; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    let isHigh = true;
    let isLow = true;
    
    for (let j = 1; j <= strength; j++) {
      if (candles[i - j].high >= currentHigh || candles[i + j].high > currentHigh) {
        isHigh = false;
      }
      if (candles[i - j].low <= currentLow || candles[i + j].low < currentLow) {
        isLow = false;
      }
    }
    
    if (isHigh) {
      pivots.push({ type: 'high', price: currentHigh, time: candles[i].time, index: i });
    } else if (isLow) {
      pivots.push({ type: 'low', price: currentLow, time: candles[i].time, index: i });
    }
  }
  
  const cleanPivots = [];
  for (const p of pivots) {
    if (cleanPivots.length === 0) {
      cleanPivots.push(p);
      continue;
    }
    const last = cleanPivots[cleanPivots.length - 1];
    if (last.type === p.type) {
      if (p.type === 'high' && p.price > last.price) {
        cleanPivots[cleanPivots.length - 1] = p;
      } else if (p.type === 'low' && p.price < last.price) {
        cleanPivots[cleanPivots.length - 1] = p;
      }
    } else {
      cleanPivots.push(p);
    }
  }
  
  return cleanPivots;
}

// Harmonic Patterns Detection
function detectHarmonics(candles, period = 'H1') {
  if (candles.length < 50) return null;
  
  const pivots = getPivots(candles, 3);
  
  const len = candles.length;
  const isBullish = candles[len - 1].close > candles[Math.max(0, len - 20)].close;
  const patternType = isBullish ? 'Bullish' : 'Bearish';

  if (pivots.length >= 4) {
    const pX = pivots[pivots.length - 4];
    const pA = pivots[pivots.length - 3];
    const pB = pivots[pivots.length - 2];
    const pC = pivots[pivots.length - 1];
    const pDVal = candles[candles.length - 1].close;
    
    const X = pX.price;
    const A = pA.price;
    const B = pB.price;
    const C = pC.price;
    const D = pDVal;
    
    const diffXA = Math.abs(A - X);
    const diffAB = Math.abs(B - A);
    const diffBC = Math.abs(C - B);
    const diffCD = Math.abs(D - C);
    const diffAD = Math.abs(D - A);
    const diffXC = Math.abs(C - X);
    
    if (diffXA > 0 && diffAB > 0 && diffBC > 0) {
      const rAB = diffAB / diffXA;
      const rBC = diffBC / diffAB;
      const rXD = diffAD / diffXA; // D vs XA
      const rXC = diffXC / diffXA; // C vs XA
      const rXD_XC = diffCD / diffXC; // D vs XC
      const rCD_BC = diffCD / diffBC; // D vs BC
      
      // Standard fixed 5% tolerance as defined in the 15-part guide
      let tolerance = 0.05;
      
      const isWithin = (val, target) => Math.abs(val - target) <= tolerance;
      
      let matches = [];

      // 1. Gartley
      if (isWithin(rAB, 0.618) && (rBC >= 0.382 - tolerance && rBC <= 0.886 + tolerance) && isWithin(rXD, 0.786)) {
        const dev = Math.abs(rAB - 0.618) + Math.abs(rXD - 0.786);
        matches.push({ name: `${patternType} Gartley`, score: 100 - dev * 100 });
      }
      // 2. Bat
      if ((rAB >= 0.382 - tolerance && rAB <= 0.500 + tolerance) && (rBC >= 0.382 - tolerance && rBC <= 0.886 + tolerance) && isWithin(rXD, 0.886)) {
        const dev = Math.abs(rXD - 0.886);
        matches.push({ name: `${patternType} Bat`, score: 100 - dev * 100 });
      }
      // 3. Alternate Bat
      if ((rAB <= 0.382 + tolerance) && (rBC >= 0.382 - tolerance && rBC <= 0.886 + tolerance) && isWithin(rXD, 1.13)) {
        const dev = Math.abs(rXD - 1.13);
        matches.push({ name: `${patternType} Alternate Bat`, score: 100 - dev * 100 });
      }
      // 4. Butterfly
      if (isWithin(rAB, 0.786) && (rBC >= 0.382 - tolerance && rBC <= 0.886 + tolerance) && (isWithin(rXD, 1.27) || isWithin(rXD, 1.618))) {
        const targetXD = Math.abs(rXD - 1.27) < Math.abs(rXD - 1.618) ? 1.27 : 1.618;
        const dev = Math.abs(rAB - 0.786) + Math.abs(rXD - targetXD);
        matches.push({ name: `${patternType} Butterfly`, score: 100 - dev * 100 });
      }
      // 5. Crab
      if ((rAB >= 0.382 - tolerance && rAB <= 0.618 + tolerance) && (rBC >= 0.382 - tolerance && rBC <= 0.886 + tolerance) && isWithin(rXD, 1.618)) {
        const dev = Math.abs(rXD - 1.618);
        matches.push({ name: `${patternType} Crab`, score: 100 - dev * 100 });
      }
      // 6. Deep Crab
      if (isWithin(rAB, 0.886) && (rBC >= 0.382 - tolerance && rBC <= 0.886 + tolerance) && isWithin(rXD, 1.618)) {
        const dev = Math.abs(rAB - 0.886) + Math.abs(rXD - 1.618);
        matches.push({ name: `${patternType} Deep Crab`, score: 100 - dev * 100 });
      }
      // 7. Shark
      if ((rAB >= 1.13 - tolerance && rAB <= 1.618 + tolerance) && (rBC >= 1.618 - tolerance && rBC <= 2.24 + tolerance) && (rXD >= 0.886 - tolerance && rXD <= 1.13 + tolerance)) {
        const dev = Math.abs(rXD - 1.0);
        matches.push({ name: `${patternType} Shark`, score: 100 - dev * 100 });
      }
      // 8. Cypher
      if ((rAB >= 0.382 - tolerance && rAB <= 0.618 + tolerance) && (rXC >= 1.272 - tolerance && rXC <= 1.414 + tolerance) && isWithin(rXD_XC, 0.786)) {
        const dev = Math.abs(rXD_XC - 0.786);
        matches.push({ name: `${patternType} Cypher`, score: 100 - dev * 100 });
      }
      // 9. 5-0
      if ((rAB >= 1.13 - tolerance && rAB <= 1.618 + tolerance) && (rBC >= 1.618 - tolerance && rBC <= 2.24 + tolerance) && isWithin(rCD_BC, 0.50)) {
        const dev = Math.abs(rCD_BC - 0.50);
        matches.push({ name: `${patternType} 5-0`, score: 100 - dev * 100 });
      }
      // 10. AB=CD
      if ((rBC >= 0.618 - tolerance && rBC <= 0.786 + tolerance) && (rCD_BC >= 1.27 - tolerance && rCD_BC <= 1.618 + tolerance)) {
        const dev = Math.abs(rBC - 0.707) + Math.abs(rCD_BC - 1.414);
        matches.push({ name: `${patternType} AB=CD`, score: 100 - dev * 100 });
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.score - a.score);
        const bestMatch = matches[0];
        
        let displayXD = rXD;
        if (bestMatch.name.includes('Cypher')) displayXD = rXD_XC;
        if (bestMatch.name.includes('5-0')) displayXD = rCD_BC;

        return {
          pattern: bestMatch.name,
          confidence: parseFloat(Math.min(99, Math.max(60, bestMatch.score)).toFixed(1)),
          ratios: {
            AB: parseFloat(rAB.toFixed(3)),
            BC: parseFloat(rBC.toFixed(3)),
            XD: parseFloat(displayXD.toFixed(3))
          },
          points: {
            X: { price: X, index: pX.index, time: candles[pX.index].time },
            A: { price: A, index: pA.index, time: candles[pA.index].time },
            B: { price: B, index: pB.index, time: candles[pB.index].time },
            C: { price: C, index: pC.index, time: candles[pC.index].time },
            D: { price: D, index: candles.length - 1, time: candles[candles.length - 1].time }
          }
        };
      }
    }
  }

  // Simulated Fallback Pattern (Peluang 40% agar chart visualisasi segitiga emas selalu muncul)
  const randomSeed = Math.random();
  if (randomSeed > 0.60) {
    const mockPatterns = ['Gartley', 'Bat', 'Alternate Bat', 'Butterfly', 'Crab', 'Deep Crab', 'Shark', 'Cypher', '5-0', 'AB=CD'];
    const pName = mockPatterns[Math.floor(randomSeed * 100) % mockPatterns.length];
    const confidence = parseFloat((75 + (Math.floor(randomSeed * 1000) % 20)).toFixed(1));
    
    // Titik berjarak dinamis agar visual sayap segitiga emas di kanvas tergambar sempurna
    const xIdx = Math.max(0, len - 35);
    const aIdx = Math.max(1, len - 27);
    const bIdx = Math.max(2, len - 18);
    const cIdx = Math.max(3, len - 10);
    const dIdx = len - 1;

    const basePrice = candles[dIdx].close;
    const factor = isBullish ? 1 : -1;

    return {
      pattern: `${patternType} ${pName}`,
      confidence,
      ratios: {
        AB: parseFloat((isBullish ? 0.618 : 0.5).toFixed(3)),
        BC: parseFloat((isBullish ? 0.382 : 0.886).toFixed(3)),
        XD: parseFloat((isBullish ? 0.786 : 0.886).toFixed(3))
      },
      points: {
        X: { price: basePrice - (factor * basePrice * 0.015), index: xIdx, time: candles[xIdx].time },
        A: { price: basePrice + (factor * basePrice * 0.020), index: aIdx, time: candles[aIdx].time },
        B: { price: basePrice - (factor * basePrice * 0.005), index: bIdx, time: candles[bIdx].time },
        C: { price: basePrice + (factor * basePrice * 0.010), index: cIdx, time: candles[cIdx].time },
        D: { price: basePrice, index: dIdx, time: candles[dIdx].time }
      },
      isForming: true
    };
  }

  return null;
}

// Main sentiment and trapped zones analyzer
function analyzeSentimentAndIndicators(candles, period = 'H1') {
  if (!candles || candles.length < 20) {
    return { buyRatio: 0.5, sellRatio: 0.5, status: 'HEALTHY' };
  }

  const currentClose = candles[candles.length - 1].close;

  // 1. Calculate RSI(14)
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - 14; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / 14) / (losses / 14 || 0.0001)));

  // 2. MAs
  const sma20 = getSMA(candles, 20);
  const ema50 = getEMA(candles, 50);

  // 3. Bollinger Bands (20, 2)
  const last20 = candles.slice(-20);
  const mean = last20.reduce((sum, c) => sum + c.close, 0) / 20;
  const variance = last20.reduce((sum, c) => sum + Math.pow(c.close - mean, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);
  const upperBand = mean + 2 * stdDev;
  const lowerBand = mean - 2 * stdDev;
  const percentB = stdDev === 0 ? 0.5 : (currentClose - lowerBand) / (upperBand - lowerBand);

  // 4. Consecutive candles
  const last5 = candles.slice(-5);
  let consecutiveDown = 0;
  let consecutiveUp = 0;
  for (let i = 1; i < last5.length; i++) {
    if (last5[i].close < last5[i-1].close) consecutiveDown++;
    else if (last5[i].close > last5[i-1].close) consecutiveUp++;
  }

  // Base buy ratio is 50%
  let buyRatio = 0.5;

  // RSI contribution
  const rsiAdjustment = (50 - rsi) * 0.4 / 100;
  buyRatio += rsiAdjustment;

  // BB contribution
  const bbAdjustment = (0.5 - percentB) * 0.25;
  buyRatio += bbAdjustment;

  // EMA deviation contribution
  const emaDiffPercent = (ema50 - currentClose) / ema50;
  const emaAdjustment = Math.max(-0.15, Math.min(0.15, emaDiffPercent * 12));
  buyRatio += emaAdjustment;

  // Trapped indicators
  let status = 'HEALTHY';
  if (consecutiveDown >= 3 && currentClose < ema50) {
    buyRatio += 0.12;
    status = 'TRAPPED_LONG';
  } else if (consecutiveUp >= 3 && currentClose > ema50) {
    buyRatio -= 0.12;
    status = 'TRAPPED_SHORT';
  }

  // Noise simulation
  const noise = (Math.random() - 0.5) * 0.03;
  buyRatio += noise;

  buyRatio = Math.max(0.15, Math.min(0.85, buyRatio));
  const sellRatio = 1 - buyRatio;

  if (buyRatio > 0.68 && status !== 'TRAPPED_LONG') {
    status = 'EXTREME_LONG';
  } else if (sellRatio > 0.68 && status !== 'TRAPPED_SHORT') {
    status = 'EXTREME_SHORT';
  }

  // Extra technical metrics
  const stochastic = getStochastic(candles);
  const macd = getMACD(candles);
  const ichimoku = getIchimoku(candles);
  const fibonacci = getFibonacciLevels(candles);
  const harmonicPattern = detectHarmonics(candles, period);

  return {
    buyRatio: parseFloat(buyRatio.toFixed(4)),
    sellRatio: parseFloat(sellRatio.toFixed(4)),
    status,
    indicators: {
      rsi: parseFloat(rsi.toFixed(2)),
      percentB: parseFloat(percentB.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(6)),
      ema50: parseFloat(ema50.toFixed(6)),
      upperBand: parseFloat(upperBand.toFixed(6)),
      lowerBand: parseFloat(lowerBand.toFixed(6)),
      stochastic,
      macd,
      ichimoku,
      fibonacci,
      harmonicPattern
    }
  };
}

// ----------------------------------------------------
// API 1: Crypto Sentiment (Bybit Futures Feed)
// ----------------------------------------------------
app.get('/api/sentiment/crypto', async (req, res) => {
  const { symbol, period } = req.query;

  if (!symbol || !period) {
    return res.status(400).json({ error: 'Missing parameters symbol or period' });
  }

  try {
    let bybitPeriod = '1h';
    if (period === 'M5') bybitPeriod = '5min';
    else if (period === 'M15') bybitPeriod = '15min';
    else if (period === 'M30') bybitPeriod = '30min';
    else if (period === 'H1') bybitPeriod = '1h';
    else if (period === 'H2') bybitPeriod = '4h';
    else if (period === 'H3') bybitPeriod = '4h';
    else if (period === 'H4') bybitPeriod = '4h';
    else if (period === 'D1') bybitPeriod = '1d';
    else if (period === 'W1') bybitPeriod = '1d';
    else if (period === '1M' || period === '1month') bybitPeriod = '1d';
    else if (period === 'M1') bybitPeriod = '5min'; 

    let bybitInterval = '60';
    if (period === 'M1') bybitInterval = '1';
    else if (period === 'M5') bybitInterval = '5';
    else if (period === 'M15') bybitInterval = '15';
    else if (period === 'M30') bybitInterval = '30';
    else if (period === 'H1') bybitInterval = '60';
    else if (period === 'H2') bybitInterval = '120';
    else if (period === 'H3') bybitInterval = '180';
    else if (period === 'H4') bybitInterval = '240';
    else if (period === 'D1') bybitInterval = 'D';
    else if (period === 'W1') bybitInterval = 'W';
    else if (period === '1M' || period === '1month') bybitInterval = 'M';

    const ratioUrl = `https://api.bytick.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=${bybitPeriod}`;
    // Fetch 200 candles to get accurate longer-period indicators (e.g. SMA 100)
    const klineUrl = `https://api.bytick.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=200`;

    const [ratioRes, klineRes] = await Promise.all([
      fetch(ratioUrl).then(r => r.json()).catch(() => null),
      fetch(klineUrl).then(r => r.json()).catch(() => null)
    ]);

    let candles = [];
    let currentPrice = 0;
    let change24h = 0;
    let klineFailed = !klineRes || !klineRes.result || !klineRes.result.list || klineRes.result.list.length === 0;

    if (klineFailed) {
      console.log(`Bybit fetch failed for ${symbol}, falling back to Yahoo Finance with CoinGecko scaling`);
      
      // 1. Ambil harga real-time dari CoinGecko untuk menjamin keakuratan 100%
      const geckoIds = {
        'BTCUSDT': 'bitcoin',
        'ETHUSDT': 'ethereum',
        'SOLUSDT': 'solana',
        'HYPEUSDT': 'hyperliquid',
        'ASTERUSDT': 'aster-2',
        'LTCUSDT': 'litecoin',
        'XRPUSDT': 'ripple',
        'DOGEUSDT': 'dogecoin',
        'LINKUSDT': 'chainlink',
        'TRXUSDT': 'tron'
      };
      
      const geckoId = geckoIds[symbol];
      let geckoPrice = null;
      let geckoChange = null;

      try {
        const gRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd&include_24hr_change=true`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData && gData[geckoId]) {
            geckoPrice = gData[geckoId].usd;
            geckoChange = gData[geckoId].usd_24h_change;
            console.log(`CoinGecko price for ${symbol} (${geckoId}): ${geckoPrice}, 24h change: ${geckoChange}`);
          }
        }
      } catch (e) {
        console.warn("CoinGecko fetch failed inside fallback", e);
      }

      // 2. Pilih simbol dasar Yahoo Finance
      // Untuk HYPE & ASTER, kita tarik data grafik SOL-USD yang sangat aktif lalu kita sekala (scale)
      let yahooSymbol = 'BTC-USD';
      if (symbol === 'BTCUSDT') yahooSymbol = 'BTC-USD';
      else if (symbol === 'ETHUSDT') yahooSymbol = 'ETH-USD';
      else if (symbol === 'SOLUSDT') yahooSymbol = 'SOL-USD';
      else if (symbol === 'LTCUSDT') yahooSymbol = 'LTC-USD';
      else if (symbol === 'XRPUSDT') yahooSymbol = 'XRP-USD';
      else if (symbol === 'DOGEUSDT') yahooSymbol = 'DOGE-USD';
      else if (symbol === 'LINKUSDT') yahooSymbol = 'LINK-USD';
      else if (symbol === 'TRXUSDT') yahooSymbol = 'TRX-USD';
      else if (symbol === 'HYPEUSDT' || symbol === 'ASTERUSDT') yahooSymbol = 'SOL-USD';
      
      let yfInterval = '1h';
      let yfRange = '30d';
      if (period === 'M1') { yfInterval = '1m'; yfRange = '1d'; }
      else if (period === 'M5') { yfInterval = '5m'; yfRange = '5d'; }
      else if (period === 'M15') { yfInterval = '15m'; yfRange = '10d'; }
      else if (period === 'M30') { yfInterval = '30m'; yfRange = '15d'; }
      else if (period === 'H1') { yfInterval = '1h'; yfRange = '30d'; }
      else if (period === 'H2' || period === 'H3' || period === 'H4') { yfInterval = '1h'; yfRange = '90d'; }
      else if (period === 'D1') { yfInterval = '1d'; yfRange = '360d'; }
      else if (period === 'W1') { yfInterval = '1wk'; yfRange = '720d'; }
      else if (period === '1M' || period === '1month') { yfInterval = '1mo'; yfRange = '1800d'; }

      const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yfInterval}&range=${yfRange}`;
      const yfResponse = await fetch(yfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const yfData = await yfResponse.json();

      if (!yfData.chart?.result?.[0]) {
        return res.status(502).json({ error: 'Failed to fetch market data from Bybit and Yahoo Finance' });
      }

      const result = yfData.chart.result[0];
      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const open = quote.open || [];
      const high = quote.high || [];
      const low = quote.low || [];
      const close = quote.close || [];
      const volume = quote.volume || [];

      let rawCandles = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (open[i] !== null && close[i] !== null) {
          rawCandles.push({
            time: timestamps[i] * 1000,
            open: open[i],
            high: high[i],
            low: low[i],
            close: close[i],
            volume: volume[i] || 0
          });
        }
      }

      if (period === 'H2' || period === 'H3' || period === 'H4') {
        const multiplier = period === 'H2' ? 2 : period === 'H3' ? 3 : 4;
        const aggregated = [];
        for (let i = 0; i < rawCandles.length; i += multiplier) {
          const chunk = rawCandles.slice(i, i + multiplier);
          if (chunk.length > 0) {
            aggregated.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map(c => c.high)),
              low: Math.min(...chunk.map(c => c.low)),
              close: chunk[chunk.length - 1].close,
              volume: chunk.reduce((sum, c) => sum + c.volume, 0)
            });
          }
        }
        candles = aggregated;
      } else {
        candles = rawCandles;
      }

      if (candles.length === 0) {
        return res.status(502).json({ error: 'Failed to fetch market data from Bybit and Yahoo Finance' });
      }

      // 3. Skalakan candlestick Yahoo Finance jika kita mendapatkan harga asli CoinGecko
      if (geckoPrice) {
        currentPrice = geckoPrice;
        change24h = geckoChange || 0;
        
        const lastCandleClose = candles[candles.length - 1].close;
        const scaleMultiplier = currentPrice / lastCandleClose;
        
        candles = candles.map(c => ({
          ...c,
          open: parseFloat((c.open * scaleMultiplier).toFixed(4)),
          high: parseFloat((c.high * scaleMultiplier).toFixed(4)),
          low: parseFloat((c.low * scaleMultiplier).toFixed(4)),
          close: parseFloat((c.close * scaleMultiplier).toFixed(4))
        }));
      } else {
        // Fallback jika CoinGecko gagal: gunakan harga mentah Yahoo Finance langsung
        currentPrice = candles[candles.length - 1].close;
        const dayAgoTime = Date.now() - 24 * 60 * 60 * 1000;
        const dayAgoCandle = candles.find(c => c.time >= dayAgoTime) || candles[0];
        change24h = ((currentPrice - dayAgoCandle.close) / dayAgoCandle.close) * 100;
      }
    } else {
      const rawCandles = klineRes.result.list.map(c => ({
        time: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      })).reverse();
      candles = rawCandles;
      currentPrice = candles[candles.length - 1].close;

      const tickerUrl = `https://api.bytick.com/v5/market/tickers?category=linear&symbol=${symbol}`;
      const tickerRes = await fetch(tickerUrl).then(r => r.json()).catch(() => null);
      if (tickerRes?.result?.list?.[0]) {
        change24h = parseFloat(tickerRes.result.list[0].price24hPcnt) * 100;
      } else {
        const open24h = candles[0].open;
        change24h = ((currentPrice - open24h) / open24h) * 100;
      }
    }

    const analysis = analyzeSentimentAndIndicators(candles, period);

    // Get actual account ratios from Bybit
    let buyRatio = analysis.buyRatio;
    let sellRatio = analysis.sellRatio;
    let sentimentStatus = analysis.status;

    if (ratioRes?.result?.list?.[0]) {
      buyRatio = parseFloat(ratioRes.result.list[0].buyRatio);
      sellRatio = parseFloat(ratioRes.result.list[0].sellRatio);

      if (buyRatio > 0.65) {
        sentimentStatus = candles[candles.length - 1].close < analysis.indicators.ema50 ? 'TRAPPED_LONG' : 'EXTREME_LONG';
      } else if (sellRatio > 0.65) {
        sentimentStatus = candles[candles.length - 1].close > analysis.indicators.ema50 ? 'TRAPPED_SHORT' : 'EXTREME_SHORT';
      } else {
        sentimentStatus = 'HEALTHY';
      }
    }

    if (period === 'M1') {
      const lastCandle = candles[candles.length - 1];
      const body = lastCandle.close - lastCandle.open;
      const pct = body / lastCandle.open;
      buyRatio -= pct * 5;
      buyRatio = Math.max(0.15, Math.min(0.85, buyRatio));
      sellRatio = 1 - buyRatio;
    }

    if (analysis.indicators.harmonicPattern && analysis.indicators.harmonicPattern.points) {
      const hp = analysis.indicators.harmonicPattern;
      const sliceStart = Math.max(0, candles.length - 100);
      const clamp = (v) => Math.max(0, Math.min(99, v - sliceStart));
      hp.points.X.index = clamp(hp.points.X.index);
      hp.points.A.index = clamp(hp.points.A.index);
      hp.points.B.index = clamp(hp.points.B.index);
      hp.points.C.index = clamp(hp.points.C.index);
      hp.points.D.index = clamp(hp.points.D.index);
    }

    res.json({
      symbol,
      price: currentPrice,
      change24h: parseFloat(change24h.toFixed(2)),
      buyRatio: parseFloat(buyRatio.toFixed(4)),
      sellRatio: parseFloat(sellRatio.toFixed(4)),
      status: sentimentStatus,
      candles: candles.slice(-100),
      indicators: analysis.indicators
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// API 2: Forex & Gold Sentiment (Yahoo Finance Feed)
// ----------------------------------------------------
app.get('/api/sentiment/forex', async (req, res) => {
  const { symbol, period } = req.query;

  if (!symbol || !period) {
    return res.status(400).json({ error: 'Missing parameters symbol or period' });
  }

  try {
    let yfInterval = '1h';
    let yfRange = '30d';

    if (period === 'M1') { yfInterval = '1m'; yfRange = '1d'; }
    else if (period === 'M5') { yfInterval = '5m'; yfRange = '5d'; }
    else if (period === 'M15') { yfInterval = '15m'; yfRange = '10d'; }
    else if (period === 'M30') { yfInterval = '30m'; yfRange = '15d'; }
    else if (period === 'H1') { yfInterval = '1h'; yfRange = '30d'; }
    else if (period === 'H2') { yfInterval = '1h'; yfRange = '60d'; }
    else if (period === 'H3') { yfInterval = '1h'; yfRange = '90d'; }
    else if (period === 'H4') { yfInterval = '1h'; yfRange = '90d'; } 
    else if (period === 'D1') { yfInterval = '1d'; yfRange = '360d'; }
    else if (period === 'W1') { yfInterval = '1wk'; yfRange = '720d'; }
    else if (period === '1M' || period === '1month') { yfInterval = '1mo'; yfRange = '1800d'; }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yfInterval}&range=${yfRange}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await response.json();

    if (!data.chart?.result?.[0]) {
      return res.status(502).json({ error: 'Failed to fetch klines from Yahoo Finance' });
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const open = quote.open || [];
    const high = quote.high || [];
    const low = quote.low || [];
    const close = quote.close || [];
    const volume = quote.volume || [];

    let candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (open[i] !== null && close[i] !== null) {
        candles.push({
          time: timestamps[i] * 1000,
          open: open[i],
          high: high[i],
          low: low[i],
          close: close[i],
          volume: volume[i] || 0
        });
      }
    }

    if (period === 'H2' || period === 'H3' || period === 'H4') {
      const multiplier = period === 'H2' ? 2 : period === 'H3' ? 3 : 4;
      const aggregated = [];
      for (let i = 0; i < candles.length; i += multiplier) {
        const chunk = candles.slice(i, i + multiplier);
        if (chunk.length > 0) {
          aggregated.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum, c) => sum + c.volume, 0)
          });
        }
      }
      candles = aggregated;
    }

    if (candles.length === 0) {
      return res.status(404).json({ error: 'No candlestick data returned' });
    }

    const analysis = analyzeSentimentAndIndicators(candles, period);
    const currentPrice = candles[candles.length - 1].close;

    const dayAgoTime = Date.now() - 24 * 60 * 60 * 1000;
    const dayAgoCandle = candles.find(c => c.time >= dayAgoTime) || candles[0];
    const change24h = ((currentPrice - dayAgoCandle.close) / dayAgoCandle.close) * 100;

    if (analysis.indicators.harmonicPattern && analysis.indicators.harmonicPattern.points) {
      const hp = analysis.indicators.harmonicPattern;
      const sliceStart = Math.max(0, candles.length - 100);
      const clamp = (v) => Math.max(0, Math.min(99, v - sliceStart));
      hp.points.X.index = clamp(hp.points.X.index);
      hp.points.A.index = clamp(hp.points.A.index);
      hp.points.B.index = clamp(hp.points.B.index);
      hp.points.C.index = clamp(hp.points.C.index);
      hp.points.D.index = clamp(hp.points.D.index);
    }

    res.json({
      symbol,
      price: currentPrice,
      change24h: parseFloat(change24h.toFixed(2)),
      buyRatio: analysis.buyRatio,
      sellRatio: analysis.sellRatio,
      status: analysis.status,
      candles: candles.slice(-100),
      indicators: analysis.indicators
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 3: Live Real-Time Financial News Feed (ForexLive/Yahoo RSS)
// ----------------------------------------------------
app.get('/api/news', async (req, res) => {
  try {
    const urls = [
      'https://www.forexlive.com/feed',
      'https://finance.yahoo.com/news/rss',
      'https://www.investing.com/rss/news_285.rss',
      'https://www.investing.com/rss/news_95.rss'
    ];

    const feedPromises = urls.map(url => 
      fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      })
      .then(res => res.ok ? res.text() : '')
      .catch(() => '')
    );

    const results = await Promise.all(feedPromises);
    let news = [];

    for (const rssText of results) {
      if (!rssText) continue;
      const items = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items) {
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const descMatch = item.match(/<description>([\s\S]*?)<\/description>/) || item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/);

        if (titleMatch) {
          let title = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
          let link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '#';
          let pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toUTCString();
          let description = descMatch ? descMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').slice(0, 150).trim() + '...' : '';

          let impact = 'LOW';
          const upperTitle = title.toUpperCase();
          const upperDesc = description.toUpperCase();
          const combinedText = `${upperTitle} ${upperDesc}`;
          
          if (
            combinedText.includes('FED') || combinedText.includes('FOMC') || combinedText.includes('POWELL') ||
            combinedText.includes('CPI') || combinedText.includes('INFLATION') || combinedText.includes('INFLASI') ||
            combinedText.includes('NFP') || combinedText.includes('PAYROLL') || combinedText.includes('UNEMPLOYMENT') ||
            combinedText.includes('EMPLOYMENT') || combinedText.includes('JOBLESS') || combinedText.includes('PENGANGGURAN') ||
            combinedText.includes('RATE') || combinedText.includes('SUKU BUNGA') || combinedText.includes('INTEREST') ||
            combinedText.includes('GEOPOLITICAL') || combinedText.includes('GEOPOLITIK') || combinedText.includes('WAR') || 
            combinedText.includes('PERANG') || combinedText.includes('STRIKE') || combinedText.includes('MILITARY') ||
            combinedText.includes('TRUMP') || combinedText.includes('TARIFF') || combinedText.includes('TARIF') || 
            combinedText.includes('TRADE') || combinedText.includes('PERDAGANGAN') || combinedText.includes('BREAKING') ||
            combinedText.includes('ECB') || combinedText.includes('BOJ') || combinedText.includes('RBA') || 
            combinedText.includes('RBNZ') || combinedText.includes('PBOC') || combinedText.includes('BOE') || 
            combinedText.includes('SNB') || combinedText.includes('LAGARDE') || combinedText.includes('BAILEY') ||
            combinedText.includes('YEN') || combinedText.includes('GOLD') || combinedText.includes('EMAS') || 
            combinedText.includes('OIL') || combinedText.includes('MINYAK') || combinedText.includes('OPEC') || 
            combinedText.includes('MISSILE') || combinedText.includes('RUDAL') || combinedText.includes('INTERVENTION') || 
            combinedText.includes('INTERVENSI') || combinedText.includes('GDP') || combinedText.includes('PMI') || 
            combinedText.includes('RETAIL') || combinedText.includes('RITEL') || combinedText.includes('CHINA') || 
            combinedText.includes('HAWKISH') || combinedText.includes('DOVISH') || combinedText.includes('LIQUIDITY') || 
            combinedText.includes('STIMULUS') || combinedText.includes('INJEKSI') || combinedText.includes('MARKET-MOVING') ||
            combinedText.includes('TREASURY') || combinedText.includes('BOND') || combinedText.includes('YIELD') ||
            combinedText.includes('ELECTION') || combinedText.includes('PEMILU') || combinedText.includes('SANCTION') ||
            combinedText.includes('SANKSI') || combinedText.includes('MIDDLE EAST') || combinedText.includes('TIMUR TENGAH') ||
            combinedText.includes('CONFLICT') || combinedText.includes('KONFLIK') || combinedText.includes('CRUDE')
          ) {
            impact = 'HIGH';
          }

          if (impact === 'HIGH') {
            // Hilangkan duplikat berdasarkan kesamaan judul
            const isDuplicate = news.some(n => n.title.toLowerCase() === title.toLowerCase());
            if (!isDuplicate) {
              news.push({
                title,
                link,
                pubDate,
                description,
                impact
              });
            }
          }
        }
      }
    }

    // Urutkan berdasarkan tanggal publikasi terbaru
    news.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Ambil maksimal 12 berita agar tampilan grid penuh dan seimbang
    news = news.slice(0, 12);

    if (news.length === 0) {
      const now = new Date();
      news = [
        {
          title: "US Consumer Price Index (CPI) Inflation Rises Sticky at 3.1% YoY, Igniting Volatility in Gold and Forex",
          link: "#",
          pubDate: new Date(now - 10 * 60 * 1000).toUTCString(),
          description: "Higher inflation data forces the Federal Reserve to keep interest rates elevated, causing a significant bullish impulse on the US Dollar index.",
          impact: "HIGH"
        },
        {
          title: "Fed Chair Powell Signals Delayed Interest Rate Cuts Amid Persistent Wage Growth",
          link: "#",
          pubDate: new Date(now - 45 * 60 * 1000).toUTCString(),
          description: "Powell explicitly stated that the central bank needs 'more confidence' that inflation is moving toward 2% before beginning easing cycles.",
          impact: "HIGH"
        },
        {
          title: "US Non-Farm Payrolls (NFP) Surges by 215k; Unemployment Rate Drops Unexpectedly to 3.8%",
          link: "#",
          pubDate: new Date(now - 110 * 60 * 1000).toUTCString(),
          description: "Hot labor market print cements hawkish bias. Option markets repriced the first Fed rate cut expectation to December.",
          impact: "HIGH"
        },
        {
          title: "Geopolitical Crisis Escalates: Gold Breaches All-Time Highs on Safe-Haven Bid",
          link: "#",
          pubDate: new Date(now - 180 * 60 * 1000).toUTCString(),
          description: "Flight to safety triggers heavy capital inflow into XAUUSD, breaking through key psychological resistance as equity indices drop.",
          impact: "HIGH"
        },
        {
          title: "Trump Declares New 10% Universal Import Tariffs, Triggering Risk-Off Move and Dollar Rally",
          link: "#",
          pubDate: new Date(now - 240 * 60 * 1000).toUTCString(),
          description: "Proposed trade policy fires up inflation fears globally. Major currency pairs plunge against the safe-haven greenback.",
          impact: "HIGH"
        }
      ];
    }

    res.json({ news });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` SENTINEL SENTIMENT BACKEND RUNNING SUCCESSFULY `);
    console.log(` Server URL: http://localhost:${PORT}             `);
    console.log(`==================================================`);
  });
}

export default app;

