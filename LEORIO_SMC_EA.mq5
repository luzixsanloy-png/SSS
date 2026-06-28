//+------------------------------------------------------------------+
//|                     LEORIO_SMC_EA.mq5                           |
//|          Smart Money Concept EA - Based on LEORIO FX Strategy   |
//|                                                                  |
//|  ======== TEAM DIVISION ARCHITECTURE ========                   |
//|  Team Alpha   : Market Structure Analysis (BOS / Swing Points)  |
//|  Team Beta    : Order Block Detection & Zone Management         |
//|  Team Gamma   : Entry Filter (ETF Confirmation)                 |
//|  Team Delta   : Risk Control (Lot / SL / TP)                   |
//|  Team Epsilon : Trade Execution & Order Management              |
//|  Team Zeta    : Dashboard & Performance Monitoring              |
//+------------------------------------------------------------------+
#property copyright "LEORIO FX Strategy EA"
#property version   "2.00"
#property description "SMC Team Architecture: Alpha/Beta/Gamma/Delta/Epsilon/Zeta"

#include <Trade\Trade.mqh>

//=== Input Parameters ===
input group "=== Risk Management ==="
input double   InpLot          = 0.01;    // Fixed Lot Size
input double   InpRR           = 3.0;     // Take Profit Ratio (1:X)

input group "=== Timeframe Settings ==="
input ENUM_TIMEFRAMES InpHTF   = PERIOD_H4;   // Structure TF (Team Alpha)
input ENUM_TIMEFRAMES InpETF   = PERIOD_M15;  // Entry TF (Team Gamma)

input group "=== Structure Detection (Team Alpha) ==="
input int      InpSwingLen     = 5;       // Swing strength
input int      InpLookback     = 150;     // Bars to scan back

input group "=== Order Block Detection (Team Beta) ==="
input int      InpOBSearchLen  = 20;      // Search range around swing
input double   InpZoneBuf      = 5.0;     // Zone buffer (points)

input group "=== Trade Settings (Team Epsilon) ==="
input int      InpMagic        = 99001;   // Magic Number
input int      InpMaxTrades    = 1;       // Max concurrent trades
input int      InpSlippage     = 10;      // Max slippage (points)


//+------------------------------------------------------------------+
//|  SHARED DATA STRUCTURES                                          |
//+------------------------------------------------------------------+
struct OBZone {
    double     high;
    double     low;
    bool       isBuy;
    bool       active;
    datetime   ob_time;
    int        ob_bar;
};

struct MarketStructure {
    double     sh1;   // Swing High ล่าสุด (bar index)
    double     sh2;   // Swing High รองลงมา
    double     sl1;   // Swing Low ล่าสุด
    double     sl2;   // Swing Low รองลงมา
    bool       bullish;   // true = Higher High + Higher Low
    bool       bearish;   // true = Lower High + Lower Low
    bool       valid;
};

struct EntrySignal {
    bool       valid;
    bool       isBuy;
    double     price;
    double     sl;
    double     tp;
};

struct RiskParams {
    double     sl;
    double     tp;
    double     lot;
    double     riskPts;
};

//+------------------------------------------------------------------+
//|  TEAM ALPHA — Market Structure Analysis                          |
//|  หน้าที่: หา Swing Points และวิเคราะห์ BOS / CHOCH              |
//+------------------------------------------------------------------+
class CTeamAlpha {
public:
    // หา Swing High บน TF ที่กำหนด, คืน bar index หรือ -1
    int FindSwingHigh(int start_bar, int lookback, ENUM_TIMEFRAMES tf)
    {
        int total   = iBars(_Symbol, tf);
        int end_bar = MathMin(start_bar + lookback, total - InpSwingLen - 1);
        for (int i = start_bar + InpSwingLen; i < end_bar; i++) {
            double h  = iHigh(_Symbol, tf, i);
            bool   ok = true;
            for (int j = 1; j <= InpSwingLen; j++) {
                if (iHigh(_Symbol, tf, i - j) >= h ||
                    iHigh(_Symbol, tf, i + j) >= h) { ok = false; break; }
            }
            if (ok) return i;
        }
        return -1;
    }

    // หา Swing Low บน TF ที่กำหนด, คืน bar index หรือ -1
    int FindSwingLow(int start_bar, int lookback, ENUM_TIMEFRAMES tf)
    {
        int total   = iBars(_Symbol, tf);
        int end_bar = MathMin(start_bar + lookback, total - InpSwingLen - 1);
        for (int i = start_bar + InpSwingLen; i < end_bar; i++) {
            double l  = iLow(_Symbol, tf, i);
            bool   ok = true;
            for (int j = 1; j <= InpSwingLen; j++) {
                if (iLow(_Symbol, tf, i - j) <= l ||
                    iLow(_Symbol, tf, i + j) <= l) { ok = false; break; }
            }
            if (ok) return i;
        }
        return -1;
    }

    // วิเคราะห์ structure รวม คืน MarketStructure
    MarketStructure Analyze()
    {
        MarketStructure ms;
        ms.valid = false;

        int sh1_bar = FindSwingHigh(1, InpLookback, InpHTF);
        if (sh1_bar < 0) return ms;
        int sh2_bar = FindSwingHigh(sh1_bar + 1, InpLookback, InpHTF);
        if (sh2_bar < 0) return ms;

        int sl1_bar = FindSwingLow(1, InpLookback, InpHTF);
        if (sl1_bar < 0) return ms;
        int sl2_bar = FindSwingLow(sl1_bar + 1, InpLookback, InpHTF);
        if (sl2_bar < 0) return ms;

        ms.sh1      = iHigh(_Symbol, InpHTF, sh1_bar);
        ms.sh2      = iHigh(_Symbol, InpHTF, sh2_bar);
        ms.sl1      = iLow(_Symbol,  InpHTF, sl1_bar);
        ms.sl2      = iLow(_Symbol,  InpHTF, sl2_bar);
        ms.bullish  = (ms.sh1 > ms.sh2 && ms.sl1 > ms.sl2);
        ms.bearish  = (ms.sh1 < ms.sh2 && ms.sl1 < ms.sl2);
        ms.valid    = true;
        return ms;
    }
};

//+------------------------------------------------------------------+
//|  TEAM BETA — Order Block Detection & Zone Management             |
//|  หน้าที่: หา OB zone จาก structure ที่ Alpha ส่งมา             |
//+------------------------------------------------------------------+
class CTeamBeta {
public:
    // รับ MarketStructure จาก Alpha แล้วหา OB zone
    // คืน OBZone ที่สมบูรณ์
    OBZone Detect(const MarketStructure &ms)
    {
        OBZone ob;
        ob.active = false;

        if (!ms.valid) return ob;

        double buf       = InpZoneBuf * _Point;
        double cur_close = iClose(_Symbol, InpHTF, 1);

        if (ms.bullish) {
            // Buy OB: แท่งแดงแรกใกล้ sl1
            int sl1_bar = FindSwingLowBar();
            if (sl1_bar < 0) return ob;

            int ob_bar = -1;
            int end    = MathMin(sl1_bar + InpOBSearchLen, InpLookback);
            for (int i = sl1_bar; i <= end; i++) {
                if (iOpen(_Symbol, InpHTF, i) > iClose(_Symbol, InpHTF, i)) {
                    ob_bar = i; break;
                }
            }
            if (ob_bar < 0) return ob;

            ob.high    = iHigh(_Symbol, InpHTF, ob_bar) + buf;
            ob.low     = iLow(_Symbol,  InpHTF, ob_bar) - buf;
            ob.isBuy   = true;
            ob.active  = (cur_close > ob.low);
            ob.ob_time = iTime(_Symbol, InpHTF, ob_bar);
            ob.ob_bar  = ob_bar;
        }
        else if (ms.bearish) {
            // Sell OB: แท่งเขียวแรกใกล้ sh1
            int sh1_bar = FindSwingHighBar();
            if (sh1_bar < 0) return ob;

            int ob_bar = -1;
            int end    = MathMin(sh1_bar + InpOBSearchLen, InpLookback);
            for (int i = sh1_bar; i <= end; i++) {
                if (iClose(_Symbol, InpHTF, i) > iOpen(_Symbol, InpHTF, i)) {
                    ob_bar = i; break;
                }
            }
            if (ob_bar < 0) return ob;

            ob.high    = iHigh(_Symbol, InpHTF, ob_bar) + buf;
            ob.low     = iLow(_Symbol,  InpHTF, ob_bar) - buf;
            ob.isBuy   = false;
            ob.active  = (cur_close < ob.high);
            ob.ob_time = iTime(_Symbol, InpHTF, ob_bar);
            ob.ob_bar  = ob_bar;
        }

        return ob;
    }

private:
    int FindSwingHighBar()
    {
        int total = iBars(_Symbol, InpHTF);
        for (int i = 1 + InpSwingLen; i < MathMin(InpLookback, total - InpSwingLen - 1); i++) {
            double h = iHigh(_Symbol, InpHTF, i);
            bool ok  = true;
            for (int j = 1; j <= InpSwingLen; j++) {
                if (iHigh(_Symbol, InpHTF, i-j) >= h ||
                    iHigh(_Symbol, InpHTF, i+j) >= h) { ok = false; break; }
            }
            if (ok) return i;
        }
        return -1;
    }

    int FindSwingLowBar()
    {
        int total = iBars(_Symbol, InpHTF);
        for (int i = 1 + InpSwingLen; i < MathMin(InpLookback, total - InpSwingLen - 1); i++) {
            double l = iLow(_Symbol, InpHTF, i);
            bool ok  = true;
            for (int j = 1; j <= InpSwingLen; j++) {
                if (iLow(_Symbol, InpHTF, i-j) <= l ||
                    iLow(_Symbol, InpHTF, i+j) <= l) { ok = false; break; }
            }
            if (ok) return i;
        }
        return -1;
    }
};

//+------------------------------------------------------------------+
//|  TEAM GAMMA — Entry Filter & Confirmation                        |
//|  หน้าที่: ตรวจว่าราคาเข้า OB zone บน ETF และยืนยัน candle      |
//+------------------------------------------------------------------+
class CTeamGamma {
public:
    // รับ OBZone จาก Beta แล้วตัดสินใจว่าเข้า signal หรือเปล่า
    EntrySignal Evaluate(const OBZone &ob)
    {
        EntrySignal sig;
        sig.valid = false;

        if (!ob.active) return sig;

        double c1_high  = iHigh(_Symbol, InpETF, 1);
        double c1_low   = iLow(_Symbol,  InpETF, 1);
        double c1_close = iClose(_Symbol, InpETF, 1);
        double c1_open  = iOpen(_Symbol,  InpETF, 1);

        if (ob.isBuy) {
            bool wick_in  = (c1_low  <= ob.high);
            bool above_lo = (c1_close > ob.low);
            bool bull_bar = (c1_close > c1_open);
            if (wick_in && above_lo && bull_bar) {
                sig.valid = true;
                sig.isBuy = true;
                sig.price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
            }
        } else {
            bool wick_in  = (c1_high >= ob.low);
            bool below_hi = (c1_close < ob.high);
            bool bear_bar = (c1_close < c1_open);
            if (wick_in && below_hi && bear_bar) {
                sig.valid = true;
                sig.isBuy = false;
                sig.price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
            }
        }

        return sig;
    }
};

//+------------------------------------------------------------------+
//|  TEAM DELTA — Risk Control & Position Sizing                     |
//|  หน้าที่: คำนวณ SL, TP, Lot จาก signal และ zone                |
//+------------------------------------------------------------------+
class CTeamDelta {
public:
    // รับ signal จาก Gamma + zone จาก Beta แล้วคำนวณ risk params
    RiskParams Calculate(const EntrySignal &sig, const OBZone &ob)
    {
        RiskParams rp;
        rp.lot     = InpLot;
        rp.riskPts = 0;
        rp.sl      = 0;
        rp.tp      = 0;

        if (!sig.valid) return rp;

        double buf = InpZoneBuf * _Point;

        if (sig.isBuy) {
            rp.sl      = NormalizeDouble(ob.low - buf, _Digits);
            rp.riskPts = sig.price - rp.sl;
            if (rp.riskPts <= 0) return rp;
            rp.tp = NormalizeDouble(sig.price + rp.riskPts * InpRR, _Digits);
        } else {
            rp.sl      = NormalizeDouble(ob.high + buf, _Digits);
            rp.riskPts = rp.sl - sig.price;
            if (rp.riskPts <= 0) return rp;
            rp.tp = NormalizeDouble(sig.price - rp.riskPts * InpRR, _Digits);
        }

        return rp;
    }
};

//+------------------------------------------------------------------+
//|  TEAM EPSILON — Trade Execution & Order Management               |
//|  หน้าที่: ส่ง order, จัดการ position, นับ trade                |
//+------------------------------------------------------------------+
class CTeamEpsilon {
private:
    CTrade m_trade;

public:
    CTeamEpsilon()
    {
        m_trade.SetExpertMagicNumber(InpMagic);
        m_trade.SetDeviationInPoints(InpSlippage);
    }

    // ส่ง order จาก signal + risk params; คืน true ถ้าสำเร็จ
    bool Execute(const EntrySignal &sig, const RiskParams &rp)
    {
        if (!sig.valid || rp.riskPts <= 0) return false;
        if (CountOpenTrades() >= InpMaxTrades) return false;

        bool ok = false;
        if (sig.isBuy) {
            ok = m_trade.Buy(rp.lot, _Symbol, sig.price, rp.sl, rp.tp, "LEORIO-BUY");
            if (ok) PrintFormat("[Epsilon] BUY  | Price=%.5f  SL=%.5f  TP=%.5f  Risk=%.0f pts",
                                sig.price, rp.sl, rp.tp, rp.riskPts / _Point);
        } else {
            ok = m_trade.Sell(rp.lot, _Symbol, sig.price, rp.sl, rp.tp, "LEORIO-SELL");
            if (ok) PrintFormat("[Epsilon] SELL | Price=%.5f  SL=%.5f  TP=%.5f  Risk=%.0f pts",
                                sig.price, rp.sl, rp.tp, rp.riskPts / _Point);
        }
        return ok;
    }

    int CountOpenTrades()
    {
        int count = 0;
        for (int i = PositionsTotal() - 1; i >= 0; i--) {
            if (PositionGetSymbol(i) == _Symbol &&
                PositionGetInteger(POSITION_MAGIC) == (long)InpMagic)
                count++;
        }
        return count;
    }
};

//+------------------------------------------------------------------+
//|  TEAM ZETA — Dashboard & Performance Monitoring                  |
//|  หน้าที่: แสดงข้อมูล status ของทุก team บนชาร์ต               |
//+------------------------------------------------------------------+
class CTeamZeta {
public:
    void Render(const MarketStructure &ms, const OBZone &ob,
                const EntrySignal &sig, int open_trades)
    {
        string s = "╔══════════════════════════════════════╗\n";
        s += "║      LEORIO SMC EA  v2.00 (Teams)    ║\n";
        s += "╚══════════════════════════════════════╝\n";
        s += StringFormat("Symbol : %s  |  HTF: %s  |  ETF: %s\n",
                          _Symbol,
                          EnumToString(InpHTF),
                          EnumToString(InpETF));
        s += "────────────────────────────────────────\n";

        // Team Alpha status
        s += "[Alpha] Structure : ";
        if (!ms.valid)       s += "ยังไม่มีข้อมูล\n";
        else if (ms.bullish) s += StringFormat("BULLISH  HH=%.5f  HL=%.5f\n", ms.sh1, ms.sl1);
        else if (ms.bearish) s += StringFormat("BEARISH  LH=%.5f  LL=%.5f\n", ms.sh1, ms.sl1);
        else                 s += "Ranging (ไม่ชัดเจน)\n";

        // Team Beta status
        s += "[Beta]  OB Zone   : ";
        if (!ob.active)  s += "ไม่มี Zone\n";
        else {
            s += StringFormat("%s  H=%.5f  L=%.5f  @%s\n",
                              ob.isBuy ? "DEMAND (Buy)" : "SUPPLY (Sell)",
                              ob.high, ob.low,
                              TimeToString(ob.ob_time, TIME_DATE|TIME_MINUTES));
        }

        // Team Gamma status
        s += "[Gamma] Entry     : ";
        if (!sig.valid) s += "รอสัญญาณ...\n";
        else s += StringFormat("SIGNAL! %s @ %.5f\n",
                               sig.isBuy ? "BUY" : "SELL", sig.price);

        // Team Epsilon status
        s += StringFormat("[Epsilon] Trades  : %d / %d\n", open_trades, InpMaxTrades);

        s += "────────────────────────────────────────\n";
        s += "[Delta] RR = 1:" + DoubleToString(InpRR, 1) +
             "  |  Lot = " + DoubleToString(InpLot, 2) + "\n";

        Comment(s);
    }
};


//+------------------------------------------------------------------+
//|  MAIN EA — Team Coordinator                                      |
//|  ทำหน้าที่ประสานงานทุก team ตามลำดับ                           |
//+------------------------------------------------------------------+
CTeamAlpha    g_alpha;
CTeamBeta     g_beta;
CTeamGamma    g_gamma;
CTeamDelta    g_delta;
CTeamEpsilon  g_epsilon;
CTeamZeta     g_zeta;

OBZone         g_ob;
MarketStructure g_ms;

//+------------------------------------------------------------------+
int OnInit()
{
    g_ob.active = false;
    g_ms.valid  = false;

    Print("=== LEORIO SMC EA v2.00 (Team Architecture) ===");
    Print("Teams: Alpha(Structure) | Beta(OB) | Gamma(Entry) | Delta(Risk) | Epsilon(Exec) | Zeta(Monitor)");
    Print("Symbol: ", _Symbol, " | HTF: ", EnumToString(InpHTF), " | ETF: ", EnumToString(InpETF));
    return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
    // ทำงานแค่บนแท่งใหม่ของ ETF
    static datetime s_etf_bar = 0;
    if (iTime(_Symbol, InpETF, 0) == s_etf_bar) return;
    s_etf_bar = iTime(_Symbol, InpETF, 0);

    // [Team Alpha] วิเคราะห์ structure ใหม่เมื่อ HTF bar เปลี่ยน
    static datetime s_htf_bar = 0;
    if (iTime(_Symbol, InpHTF, 0) != s_htf_bar) {
        s_htf_bar = iTime(_Symbol, InpHTF, 0);

        g_ms = g_alpha.Analyze();           // Alpha → MarketStructure
        g_ob = g_beta.Detect(g_ms);         // Beta  → OBZone
    }

    // [Team Gamma] ตรวจ entry signal
    EntrySignal sig = g_gamma.Evaluate(g_ob);

    // [Team Delta] คำนวณ risk ถ้ามี signal
    RiskParams  rp  = g_delta.Calculate(sig, g_ob);

    // [Team Epsilon] ส่ง order และปิด zone ถ้าเข้าแล้ว
    if (sig.valid && rp.riskPts > 0) {
        if (g_epsilon.Execute(sig, rp))
            g_ob.active = false;
    }

    // [Team Zeta] อัปเดต dashboard ทุก tick
    g_zeta.Render(g_ms, g_ob, sig, g_epsilon.CountOpenTrades());
}
//+------------------------------------------------------------------+
