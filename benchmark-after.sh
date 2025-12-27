#!/bin/bash

echo "=============================================="
echo "性能基準測試 - 優化後版本（並行執行）"
echo "=============================================="
echo ""

echo "📊 測試場景 1：台北→高雄（轉乘查詢，無快取）"
echo ""

times_1=()
for i in {1..3}; do
    echo "Run $i:"
    start=$(date +%s%N)
    npm run dev -- journey 台北 高雄 --max-transfers 1 --no-cache > /dev/null 2>&1
    end=$(date +%s%N)
    duration_ms=$(( ($end - $start) / 1000000 ))
    times_1+=($duration_ms)
    echo "  耗時：${duration_ms}ms"
    echo ""
done

echo "=============================================="
echo "📊 測試場景 2：台北→台中（轉乘查詢，無快取）"
echo ""

times_2=()
for i in {1..3}; do
    echo "Run $i:"
    start=$(date +%s%N)
    npm run dev -- journey 台北 台中 --max-transfers 1 --no-cache > /dev/null 2>&1
    end=$(date +%s%N)
    duration_ms=$(( ($end - $start) / 1000000 ))
    times_2+=($duration_ms)
    echo "  耗時：${duration_ms}ms"
    echo ""
done

# 計算平均值
avg1=$(( (${times_1[0]} + ${times_1[1]} + ${times_1[2]}) / 3 ))
avg2=$(( (${times_2[0]} + ${times_2[1]} + ${times_2[2]}) / 3 ))

echo "=============================================="
echo "測試結果總結："
echo "=============================================="
echo "台北→高雄："
echo "  Run 1: ${times_1[0]}ms"
echo "  Run 2: ${times_1[1]}ms"
echo "  Run 3: ${times_1[2]}ms"
echo "  平均：${avg1}ms"
echo ""
echo "台北→台中："
echo "  Run 1: ${times_2[0]}ms"
echo "  Run 2: ${times_2[1]}ms"
echo "  Run 3: ${times_2[2]}ms"
echo "  平均：${avg2}ms"
