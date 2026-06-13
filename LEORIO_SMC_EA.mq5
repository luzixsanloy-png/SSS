//+------------------------------------------------------------------+
//|                     LEORIO_SMC_EA.mq5                           |
//|          Smart Money Concept EA - Based on LEORIO FX Strategy   |
//|                                                                  |
//|  กลยุทธ์: Demand/Supply + OB (Order Block) + BOS/CHOCH          |
//|  - HTF: ดู structure (Higher High/Low หรือ Lower High/Low)      |
//|  - OB Buy  = แท่งแดงสุดท้ายก่อน Bullish Impulse (BOS ขึ้น)     |
//|  - OB Sell = แท่งเขียวสุดท้ายก่อน Bearish Impulse (BOS ลง)    |
//|  - Entry ETF: เมื่อราคาวิ่งเข้า OB zone และแท่งปิดยืนยัน       |
//|  - SL: ต่ำกว่า/สูงกว่า OB zone                                  |
//|  - TP: 1:3 RR                                                   |
//+------------------------------------------------------------------+
#property copyright "LEORIO FX Strategy EA"
#property version   "1.00"
#property description "Smart Money Concept: OB + Demand/Supply + BOS"

#include <Trade\Trade.mqh>

//=== Input Parameters ===
input group "=== Risk Management ==="
input double   InpLot          = 0.01;    // Fixed Lot Size
input double   InpRR           = 3.0;     // Take Profit Ratio (1:X)

input group "=== Timeframe Settings ==="
input ENUM_TIMEFRAMES InpHTF   = PERIOD_H4;   // Structure TF: ดู BOS, OB
input ENUM_TIMEFRAMES InpETF   = PERIOD_M15;  // Entry TF: ยิงออเดอร์

input group "=== Structure Detection ==="
input int      InpSwingLen     = 5;       // Swing strength (แท่งแต่ละข้าง)
input int      InpLookback     = 150;     // จำนวน bar ที่สแกนย้อนหลัง
input int      InpOBSearchLen  = 20;      // ช่วงค้นหา OB รอบ swing point

input group "=== Zone Buffer ==="
input double   InpZoneBuf      = 5.0;    // บัฟเฟอร์เพิ่ม/ลด zone (points)

input group "=== Trade Settings ==="
input int      InpMagic        = 99001;   // Magic Number
input int      InpMaxTrades    = 1;       // จำนวน trade สูงสุดพร้อมกัน
input int      InpSlippage     = 10;      // Slippage สูงสุด (points)

//=== Global ===
CTrade         g_trade;

struct OBZone {
    double     high;       // OB zone บน
    double     low;        // OB zone ล่าง
    bool       isBuy;      // true=Buy(Demand), false=Sell(Supply)
    bool       active;     // zone ยังใช้งานอยู่
    datetime   ob_time;    // เวลาของแท่ง OB
    int        ob_bar;     // bar index ของ OB บน HTF
};

OBZone         g_ob;

//+------------------------------------------------------------------+
int OnInit()
{
    g_trade.SetExpertMagicNumber(InpMagic);
    g_trade.SetDeviationInPoints(InpSlippage);
    g_ob.active = false;

    Print("=== LEORIO SMC EA เริ่มทำงาน ===");
    Print("Symbol: ", _Symbol,
          " | HTF: ", EnumToString(InpHTF),
          " | ETF: ", EnumToString(InpETF));
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

    // อัปเดต OB เมื่อมีแท่งใหม่บน HTF
    static datetime s_htf_bar = 0;
    if (iTime(_Symbol, InpHTF, 0) != s_htf_bar) {
        s_htf_bar = iTime(_Symbol, InpHTF, 0);
        UpdateOrderBlock();
    }

    // ตรวจสัญญาณเข้า
    if (g_ob.active && CountMagicTrades() < InpMaxTrades)
        CheckEntry();

    ShowComment();
}

//+------------------------------------------------------------------+
// หา Swing High: pivot บน TF ที่กำหนด
// คืนค่า bar index, หรือ -1 ถ้าไม่เจอ
int FindSwingHigh(int start_bar, int lookback, ENUM_TIMEFRAMES tf)
{
    int total   = iBars(_Symbol, tf);
    int end_bar = MathMin(start_bar + lookback, total - InpSwingLen - 1);

    for (int i = start_bar + InpSwingLen; i < end_bar; i++) {
        double h    = iHigh(_Symbol, tf, i);
        bool   ok   = true;
        for (int j = 1; j <= InpSwingLen; j++) {
            if (iHigh(_Symbol, tf, i - j) >= h ||
                iHigh(_Symbol, tf, i + j) >= h) { ok = false; break; }
        }
        if (ok) return i;
    }
    return -1;
}

//+------------------------------------------------------------------+
// หา Swing Low
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

//+------------------------------------------------------------------+
// วิเคราะห์ Structure และกำหนด OB Zone
//
// Bullish Structure (Higher High + Higher Low):
//   → Buy OB = แท่งแดงแรกที่เจอใกล้ sl1 (swing low ล่าสุด)
//
// Bearish Structure (Lower High + Lower Low):
//   → Sell OB = แท่งเขียวแรกที่เจอใกล้ sh1 (swing high ล่าสุด)
//
void UpdateOrderBlock()
{
    g_ob.active = false;
    double buf  = InpZoneBuf * _Point;

    // หา Swing High/Low 2 จุดล่าสุดบน HTF
    int sh1 = FindSwingHigh(1, InpLookback, InpHTF);
    if (sh1 < 0) return;
    int sh2 = FindSwingHigh(sh1 + 1, InpLookback, InpHTF);
    if (sh2 < 0) return;

    int sl1 = FindSwingLow(1, InpLookback, InpHTF);
    if (sl1 < 0) return;
    int sl2 = FindSwingLow(sl1 + 1, InpLookback, InpHTF);
    if (sl2 < 0) return;

    double sh1_p = iHigh(_Symbol, InpHTF, sh1);
    double sh2_p = iHigh(_Symbol, InpHTF, sh2);
    double sl1_p = iLow(_Symbol, InpHTF, sl1);
    double sl2_p = iLow(_Symbol, InpHTF, sl2);

    double cur_close = iClose(_Symbol, InpHTF, 1);

    //--- Bullish Structure: Higher High + Higher Low ---
    if (sh1_p > sh2_p && sl1_p > sl2_p) {
        // ค้นหา Buy OB: แท่งแดงแรกใกล้ sl1
        int ob_bar = -1;
        int end    = MathMin(sl1 + InpOBSearchLen, InpLookback);
        for (int i = sl1; i <= end; i++) {
            if (iOpen(_Symbol, InpHTF, i) > iClose(_Symbol, InpHTF, i)) {
                ob_bar = i;
                break;
            }
        }
        if (ob_bar < 0) return;

        g_ob.high    = iHigh(_Symbol, InpHTF, ob_bar) + buf;
        g_ob.low     = iLow(_Symbol, InpHTF, ob_bar) - buf;
        g_ob.isBuy   = true;
        g_ob.active  = (cur_close > g_ob.low); // ยกเลิกถ้าราคาทะลุลงแล้ว
        g_ob.ob_time = iTime(_Symbol, InpHTF, ob_bar);
        g_ob.ob_bar  = ob_bar;
    }
    //--- Bearish Structure: Lower High + Lower Low ---
    else if (sh1_p < sh2_p && sl1_p < sl2_p) {
        // ค้นหา Sell OB: แท่งเขียวแรกใกล้ sh1
        int ob_bar = -1;
        int end    = MathMin(sh1 + InpOBSearchLen, InpLookback);
        for (int i = sh1; i <= end; i++) {
            if (iClose(_Symbol, InpHTF, i) > iOpen(_Symbol, InpHTF, i)) {
                ob_bar = i;
                break;
            }
        }
        if (ob_bar < 0) return;

        g_ob.high    = iHigh(_Symbol, InpHTF, ob_bar) + buf;
        g_ob.low     = iLow(_Symbol, InpHTF, ob_bar) - buf;
        g_ob.isBuy   = false;
        g_ob.active  = (cur_close < g_ob.high); // ยกเลิกถ้าราคาทะลุขึ้นแล้ว
        g_ob.ob_time = iTime(_Symbol, InpHTF, ob_bar);
        g_ob.ob_bar  = ob_bar;
    }
}

//+------------------------------------------------------------------+
// ตรวจสัญญาณเข้าออเดอร์บน ETF
//
// Buy:  ราคาวิ่งไส้ลงมาถึง OB zone + แท่ง ETF ปิดบวก (bullish close)
// Sell: ราคาวิ่งไส้ขึ้นถึง OB zone + แท่ง ETF ปิดลบ (bearish close)
//
void CheckEntry()
{
    if (!g_ob.active) return;

    double c1_high  = iHigh(_Symbol, InpETF, 1);
    double c1_low   = iLow(_Symbol, InpETF, 1);
    double c1_close = iClose(_Symbol, InpETF, 1);
    double c1_open  = iOpen(_Symbol, InpETF, 1);
    double ask      = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
    double bid      = SymbolInfoDouble(_Symbol, SYMBOL_BID);

    if (g_ob.isBuy) {
        // ไส้แท่งเข้าโซน + ปิดเหนือ OB low + bullish candle
        bool wick_in  = c1_low <= g_ob.high;
        bool above_lo = c1_close > g_ob.low;
        bool bull_bar = c1_close > c1_open;

        if (wick_in && above_lo && bull_bar) {
            double sl   = g_ob.low - InpZoneBuf * _Point;
            double risk = ask - sl;
            if (risk <= 0) return;
            double tp = NormalizeDouble(ask + risk * InpRR, _Digits);
            sl         = NormalizeDouble(sl, _Digits);

            if (g_trade.Buy(InpLot, _Symbol, ask, sl, tp, "LEORIO-BUY")) {
                PrintFormat("BUY  | Ask=%.5f  SL=%.5f  TP=%.5f  Risk=%.0f pts",
                            ask, sl, tp, risk / _Point);
                g_ob.active = false;
            }
        }
    }
    else {
        // ไส้แท่งเข้าโซน + ปิดต่ำกว่า OB high + bearish candle
        bool wick_in  = c1_high >= g_ob.low;
        bool below_hi = c1_close < g_ob.high;
        bool bear_bar = c1_close < c1_open;

        if (wick_in && below_hi && bear_bar) {
            double sl   = g_ob.high + InpZoneBuf * _Point;
            double risk = sl - bid;
            if (risk <= 0) return;
            double tp = NormalizeDouble(bid - risk * InpRR, _Digits);
            sl         = NormalizeDouble(sl, _Digits);

            if (g_trade.Sell(InpLot, _Symbol, bid, sl, tp, "LEORIO-SELL")) {
                PrintFormat("SELL | Bid=%.5f  SL=%.5f  TP=%.5f  Risk=%.0f pts",
                            bid, sl, tp, risk / _Point);
                g_ob.active = false;
            }
        }
    }
}

//+------------------------------------------------------------------+
// นับ trade ที่เปิดอยู่ (magic ตรงกัน)
int CountMagicTrades()
{
    int count = 0;
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (PositionGetSymbol(i) == _Symbol &&
            PositionGetInteger(POSITION_MAGIC) == (long)InpMagic)
            count++;
    }
    return count;
}

//+------------------------------------------------------------------+
// แสดงข้อมูลบนชาร์ต
void ShowComment()
{
    string s = "╔══════════════════════════════╗\n";
    s += "║    LEORIO SMC EA  v1.00      ║\n";
    s += "╚══════════════════════════════╝\n";
    s += "Symbol : " + _Symbol + "\n";
    s += "HTF    : " + EnumToString(InpHTF) + "\n";
    s += "ETF    : " + EnumToString(InpETF) + "\n";
    s += "Trades : " + IntegerToString(CountMagicTrades()) + "/" + IntegerToString(InpMaxTrades) + "\n\n";

    if (g_ob.active) {
        s += "── OB Zone (" + (g_ob.isBuy ? "BUY / DEMAND" : "SELL / SUPPLY") + ") ──\n";
        s += "High : " + DoubleToString(g_ob.high, _Digits) + "\n";
        s += "Low  : " + DoubleToString(g_ob.low,  _Digits) + "\n";
        s += "Time : " + TimeToString(g_ob.ob_time, TIME_DATE|TIME_MINUTES) + "\n";
        s += "\nรอราคาเข้าโซน...\n";
    } else {
        s += "── รอ Structure ──\n";
        s += "ยังไม่มี OB Zone\n";
    }

    Comment(s);
}
//+------------------------------------------------------------------+
