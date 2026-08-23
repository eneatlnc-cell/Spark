/* Spark allocation donut + unlock schedule (ECharts, colors from CSS tokens).
   SLAllocChart(containerId, opts) is reusable; whitepaper figures auto-init below. */
(function () {
  "use strict";
  var s = getComputedStyle(document.documentElement);
  var muted  = s.getPropertyValue("--muted").trim();
  var rule   = s.getPropertyValue("--rule").trim();
  var bg     = s.getPropertyValue("--bg").trim();
  var ink    = s.getPropertyValue("--ink").trim();

  /* ---- refined allocation model: 4 tranches, 8 slices ----
     presale 10 = 2 at TGE + 8 vesting (20% of tranche at TGE, per spec)
     reserve 50 = fuel 15 + grants 15 + relay 10 + steward 10 (charter defaults ◇) */
  var ALLOC = [
    { value: 2,  amt: "20,000,000",   color: "#FCD34D",
      en: "Presale · TGE unlock",           zh: "预售 · TGE 解锁",
      uen: "20% of the tranche at TGE",                 uzh: "TGE 时解锁该份额的 20%" },
    { value: 8,  amt: "80,000,000",   color: "#F59E0B",
      en: "Presale · 6-mo vest",             zh: "预售 · 6 个月线性",
      uen: "Remainder vests linearly over 6 months",    uzh: "其余 6 个月线性释放" },
    { value: 30, amt: "300,000,000",  color: "#F472B6",
      en: "IDO · public LBP",                zh: "IDO · 公开 LBP",
      uen: "Distributed in full at TGE",                uzh: "TGE 全额分发" },
    { value: 10, amt: "100,000,000",  color: "#22D3EE",
      en: "DEX liquidity",                   zh: "DEX 流动性",
      uen: "Seeded at TGE · LP locked 12 months",       uzh: "TGE 注入 · LP 锁定 12 个月" },
    { value: 15, amt: "150,000,000",  color: "#818CF8",
      en: "Reserve · fuel subsidies",        zh: "储备 · 燃料补贴",
      uen: "Engine message-fuel subsidy epochs ◇",      uzh: "Engine 消息燃料补贴期 ◇" },
    { value: 15, amt: "150,000,000",  color: "#A78BFA",
      en: "Reserve · ecosystem grants",      zh: "储备 · 生态资助",
      uen: "Grants for apps, relays, tooling ◇",        uzh: "面向应用、中继与工具的资助 ◇" },
    { value: 10, amt: "100,000,000",  color: "#C084FC",
      en: "Reserve · relay & infra",         zh: "储备 · 中继与设施",
      uen: "Relay, s-node and infrastructure funding ◇", uzh: "中继、s-node 与基础设施经费 ◇" },
    { value: 10, amt: "100,000,000",  color: "#7C3AED",
      en: "Reserve · steward & endowment",   zh: "储备 · 管家与封存",
      uen: "Chartered steward liquidity · long endowment ◇", uzh: "受宪章管家流动性 · 长期封存 ◇" }
  ];

  function zh() { return document.documentElement.getAttribute("data-lang") === "zh"; }

  window.SLAllocChart = function (containerId, opts) {
    var el = document.getElementById(containerId);
    if (!el || !window.echarts) { return null; }
    opts = opts || {};
    var chart = echarts.init(el, null, { renderer: "svg" });

    function render() {
      var z = zh();
      chart.setOption({
        animation: false,
        title: {
          text: "1,000,000,000",
          subtext: z ? "SPARK 总供给\n8 个切片 · 4 个份额" : "TOTAL SPARK SUPPLY\n8 slices · 4 tranches",
          left: "center", top: "37%",
          itemGap: 4,
          textStyle: { color: ink, fontSize: 17, fontWeight: 700, fontFamily: "GeistMono, monospace" },
          subtextStyle: { color: muted, fontSize: 10, lineHeight: 14 }
        },
        tooltip: {
          trigger: "item",
          appendToBody: true,
          backgroundColor: "rgba(12,8,24,0.94)",
          borderColor: rule,
          textStyle: { color: ink, fontSize: 12 },
          formatter: function (p) {
            var d = ALLOC[p.dataIndex];
            return "<b>" + p.name + "</b><br/>" +
              p.value + "% · " + p.data.amt + " SPARK<br/>" +
              '<span style="color:' + muted + '">' + (z ? d.uzh : d.uen) + "</span>";
          }
        },
        series: [{
          type: "pie",
          radius: ["44%", "68%"],
          center: ["50%", "46%"],
          avoidLabelOverlap: true,
          minAngle: 4,
          itemStyle: { borderColor: bg, borderWidth: 3 },
          label: {
            color: muted, fontSize: 11, lineHeight: 15,
            formatter: function (p) { return p.name + "\n" + p.value + "% · " + p.data.amt.replace(/,000,000$/, "M"); }
          },
          labelLine: { length: 14, length2: 12, lineStyle: { color: rule } },
          emphasis: { scale: true, scaleSize: 5, itemStyle: { shadowBlur: 18, shadowColor: "rgba(0,0,0,0.5)" } },
          data: ALLOC.map(function (d) {
            return { value: d.value, name: z ? d.zh : d.en, amt: d.amt, itemStyle: { color: d.color } };
          })
        }]
      });
    }
    render();

    /* re-render when the site language flips */
    if (typeof MutationObserver !== "undefined") {
      var obs = new MutationObserver(render);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });
    }
    window.addEventListener("resize", function () { chart.resize(); });
    return chart;
  };

  /* ---- Figure 1 (whitepaper): refined allocation donut ---- */
  if (document.getElementById("chart-alloc")) {
    window.SLAllocChart("chart-alloc", {});
  }

  /* ---- Figure 2 (whitepaper): circulating supply after TGE ---- */
  var el2 = document.getElementById("chart-unlock");
  if (el2 && window.echarts) {
    var amber   = s.getPropertyValue("--amber").trim();
    var accent  = s.getPropertyValue("--accent").trim();
    var months = ["TGE", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
    /* presale vests 2% -> 10% linearly over 6 months; IDO 30% + LP 10% live from TGE */
    var liquid = [42, 43.3, 44.7, 46, 47.3, 48.7, 50, 50, 50, 50, 50, 50, 50];
    var c2 = echarts.init(el2, null, { renderer: "svg" });
    c2.setOption({
      animation: false,
      tooltip: {
        trigger: "axis",
        appendToBody: true,
        valueFormatter: function (v) { return v + "%"; }
      },
      legend: { bottom: 0, textStyle: { color: muted, fontSize: 12 }, icon: "circle" },
      grid: { left: 48, right: 20, top: 30, bottom: 66 },
      xAxis: {
        type: "category",
        data: months,
        axisLine: { lineStyle: { color: rule } },
        axisLabel: { color: muted, fontSize: 11 }
      },
      yAxis: {
        type: "value",
        min: 0, max: 100,
        axisLabel: { color: muted, fontSize: 11, formatter: "{value}%" },
        splitLine: { lineStyle: { color: rule } }
      },
      series: [
        {
          name: "Liquid circulating (presale + IDO + LP)",
          type: "line",
          data: liquid,
          symbol: "circle", symbolSize: 7,
          lineStyle: { color: amber, width: 3 },
          itemStyle: { color: amber },
          areaStyle: { color: "rgba(245,158,11,0.10)" }
        },
        {
          name: "DAO reserve — governance-gated ceiling",
          type: "line",
          data: months.map(function () { return 50; }),
          symbol: "none",
          lineStyle: { color: accent, width: 2, type: "dashed" }
        }
      ]
    });
    window.addEventListener("resize", function () { c2.resize(); });
  }
})();
