#!/bin/bash

# 並行優化性能基準測試腳本
# Parallel Optimization Benchmark Test Script

set -e

RESULTS_FILE="benchmark-results.json"
TOTAL_RUNS=3
WARMUP_RUNS=1

echo "================================================"
echo "並行優化性能基準測試 - Phase 1"
echo "Parallel Optimization Benchmark Test - Phase 1"
echo "================================================"
echo ""

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 函數：運行測試並記錄耗時
run_test() {
    local test_name=$1
    local command=$2
    local runs=$3

    echo -e "${BLUE}▶ 測試：${test_name}${NC}"
    echo "  命令：${command}"

    local total_time=0
    local times=()

    # 預熱運行
    echo "  ⏳ 預熱 (${WARMUP_RUNS} 次)..."
    for ((i=1; i<=WARMUP_RUNS; i++)); do
        eval "${command}" > /dev/null 2>&1
    done

    # 正式運行
    echo "  ⏳ 運行 (${runs} 次)..."
    for ((i=1; i<=runs; i++)); do
        start_time=$(date +%s%N)
        eval "${command}" > /dev/null 2>&1
        end_time=$(date +%s%N)

        duration=$((($end_time - $start_time) / 1000000)) # 轉換為毫秒
        times+=($duration)
        total_time=$((total_time + duration))

        echo -n "."
    done
    echo ""

    # 計算統計數據
    local avg_time=$((total_time / runs))
    local min_time=${times[0]}
    local max_time=${times[0]}

    for time in "${times[@]}"; do
        if [ $time -lt $min_time ]; then
            min_time=$time
        fi
        if [ $time -gt $max_time ]; then
            max_time=$time
        fi
    done

    echo -e "  ${GREEN}✓ 完成${NC}"
    echo "    平均耗時：${avg_time}ms"
    echo "    最小耗時：${min_time}ms"
    echo "    最大耗時：${max_time}ms"
    echo "    個別結果：${times[*]}ms"
    echo ""

    echo "${avg_time}:${min_time}:${max_time}:${times[*]}"
}

# 測試場景定義
echo -e "${YELLOW}📊 測試場景：${NC}"
echo "  1. journey 台北→高雄（1 次轉乘，無快取）"
echo "  2. journey 台北→台中（1 次轉乘，無快取）"
echo ""

# 執行測試
echo -e "${YELLOW}🏃 開始基準測試...${NC}"
echo ""

# 測試 1：台北→高雄
result1=$(run_test \
    "journey 台北→高雄（轉乘查詢）" \
    "npm run dev -- journey 台北 高雄 --max-transfers 1 --no-cache" \
    $TOTAL_RUNS
)

# 測試 2：台北→台中
result2=$(run_test \
    "journey 台北→台中（轉乘查詢）" \
    "npm run dev -- journey 台北 台中 --max-transfers 1 --no-cache" \
    $TOTAL_RUNS
)

# 保存結果到 JSON
cat > $RESULTS_FILE << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "test_framework": "custom_bash",
  "total_runs": $TOTAL_RUNS,
  "warmup_runs": $WARMUP_RUNS,
  "tests": [
    {
      "name": "journey 台北→高雄（轉乘查詢）",
      "command": "npm run dev -- journey 台北 高雄 --max-transfers 1 --no-cache",
      "results": {
        "data": "$result1"
      }
    },
    {
      "name": "journey 台北→台中（轉乘查詢）",
      "command": "npm run dev -- journey 台北 台中 --max-transfers 1 --no-cache",
      "results": {
        "data": "$result2"
      }
    }
  ],
  "notes": "使用原生 Promise.all 並行優化，支線和轉乘查詢均已並行化"
}
EOF

echo -e "${GREEN}✓ 基準測試完成！${NC}"
echo -e "  結果已保存到：${YELLOW}${RESULTS_FILE}${NC}"
echo ""

# 生成對比報告
echo -e "${YELLOW}📈 性能對比分析：${NC}"
echo ""
echo "基於設計文檔的預期性能對比："
echo ""
echo "場景：journey 台北→高雄"
echo "  優化前（順序執行）：~12 秒"
echo "  優化後（並行執行）：預期 ~2 秒"
echo "  理論加速比：6x"
echo ""
echo "場景：支線查詢（6 條支線）"
echo "  優化前（順序執行）：~3 秒"
echo "  優化後（並行執行）：預期 ~0.5 秒"
echo "  理論加速比：6x"
echo ""

# 詳細結果
IFS=':' read -r avg1 min1 max1 times1 <<< "$result1"
IFS=':' read -r avg2 min2 max2 times2 <<< "$result2"

echo "實際測試結果："
echo ""
echo "台北→高雄轉乘查詢："
echo "  平均耗時：${avg1}ms"
echo "  範圍：${min1}ms - ${max1}ms"
echo ""
echo "台北→台中轉乘查詢："
echo "  平均耗時：${avg2}ms"
echo "  範圍：${min2}ms - ${max2}ms"
echo ""

echo -e "${GREEN}✓ 測試完成！${NC}"
