(() => {
  "use strict";
  const copy = {
    zh: {
      title: "每日填报", write: "填写投放数据", saveHint: "同一天、同一个 Offer 和平台只记一笔。再次保存会更新这笔数据。",
      date: "日期", platform: "平台", spend: "花费（USD）", cpcInput: "CPC（可选）", cpc: "CPC", orders: "出单",
      revenue: "营收（USD）", net: "净盈亏（USD）", save: "保存日报", totals: "团队填报汇总",
      scope: "此处汇总通过日报表单录入的数据。历史报表仍在「测试结果」页。", from: "开始日期", to: "结束日期",
      apply: "查询", mine: "我的日报", team: "员工填报明细", member: "员工", everyone: "全部成员", edit: "编辑",
      previous: "上一页", next: "下一页", empty: "此范围暂无日报", loading: "加载中…", saved: "日报已保存。",
      saveError: "未能保存日报，请检查数据和登录状态后重试。", loadError: "加载失败，请点击「查询」重试。",
      invalidDates: "请填写有效的日期范围，最多查询 366 天。", invalidOffer: "请输入 Offer 名称。"
    },
    en: {
      title: "Daily reporting", write: "Submit ad results", saveHint: "Each date, offer and platform has one record. Saving again updates that record.",
      date: "Date", platform: "Platform", spend: "Spend (USD)", cpcInput: "CPC (optional)", cpc: "CPC", orders: "Sales",
      revenue: "Revenue (USD)", net: "Net P/L (USD)", save: "Save report", totals: "Team submission totals",
      scope: "Totals cover entries submitted here. Historical reports are in Test Results.", from: "Start date", to: "End date",
      apply: "Apply", mine: "My daily reports", team: "Employee reports", member: "Employee", everyone: "All members", edit: "Edit",
      previous: "Previous", next: "Next", empty: "No entries in this date range", loading: "Loading…", saved: "Report saved.",
      saveError: "Could not save. Check the data and your session before trying again.", loadError: "Could not load. Select Apply to retry.",
      invalidDates: "Enter a valid date range of up to 366 days.", invalidOffer: "Enter an offer name."
    }
  };
  const dateInShanghai = daysAgo => new Date(Date.now() + 28800000 - daysAgo * 86400000).toISOString().slice(0, 10);
  const pageSize = 30;

  window.createAdRelayDailyReports = function(client) {
    const root = document.getElementById("daily-reports");
    if (!root || !client) return null;
    const collapsible = root.tagName === "DETAILS";
    const get = id => document.getElementById(id);
    const form = get("daily-form");
    const filter = get("daily-filter");
    const member = get("daily-member");
    const submit = form.querySelector('[type="submit"]');
    const members = new Map();
    let active = null;
    let lang = "zh";
    let page = 0;
    let request = 0;
    let saving = false;
    let range;
    let results;
    let saveStatus;
    let listStatus;
    const tr = key => copy[lang][key];

    function resetInputs() {
      form.reset();
      filter.reset();
      form.elements.date.value = dateInShanghai(0);
      filter.elements.from.value = dateInShanghai(6);
      filter.elements.to.value = dateInShanghai(0);
      range = { from: filter.elements.from.value, to: filter.elements.to.value, offer: "" };
    }

    function status(id, value) {
      const output = get(id);
      output.textContent = value ? tr(value.key) : "";
      output.toggleAttribute("data-error", Boolean(value?.error));
    }

    function updateMemberOptions(roster) {
      const selection = member.value;
      const next = new Map(roster.map(row => [row.user_id, row.display_name]));
      if (active) next.set(active.user_id, active.display_name);
      if (next.size === members.size && [...next].every(([id, name]) => members.get(id) === name)) return;
      members.clear();
      member.replaceChildren(new Option(tr("everyone"), ""));
      for (const [id, name] of next) {
        members.set(id, name);
        member.add(new Option(name, id));
      }
      member.value = members.has(selection) ? selection : "";
    }

    function renderTable(table, headings, items, cells) {
      const header = document.createElement("thead");
      const heading = header.insertRow();
      for (const key of headings) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = key === "offer" ? "Offer" : tr(key);
        heading.append(th);
      }
      const body = document.createElement("tbody");
      if (!items.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = headings.length;
        cell.textContent = tr("empty");
      }
      for (const item of items) {
        const row = body.insertRow();
        for (const value of cells(item)) {
          if (typeof value === "string") row.insertCell().textContent = value;
          else row.insertCell().append(value);
        }
      }
      table.replaceChildren(header, body);
    }

    function editButton(item) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tr("edit");
      button.addEventListener("click", () => {
        form.elements.date.value = item.report_date;
        form.elements.offer.value = item.offer;
        form.elements.platform.value = item.platform;
        for (const key of ["spend", "cpc", "purchases", "revenue"]) form.elements[key].value = item[key] ?? "";
        saveStatus = null;
        status("daily-save-status", null);
        form.elements.spend.focus();
      });
      return button;
    }

    function render() {
      root.hidden = !active;
      root.querySelectorAll("[data-daily-text]").forEach(node => { node.textContent = tr(node.dataset.dailyText); });
      const isAdmin = active?.role === "admin";
      get("daily-details-title").textContent = tr(isAdmin ? "team" : "mine");
      get("daily-member-filter").hidden = !isAdmin;
      if (member.options.length) member.options[0].text = tr("everyone");
      status("daily-save-status", saveStatus);
      status("daily-list-status", listStatus);
      const teamTable = get("daily-totals");
      const detailsTable = get("daily-details");
      get("daily-pagination").hidden = !results || (page === 0 && !results.more);
      if (!results) {
        teamTable.replaceChildren();
        detailsTable.replaceChildren();
        return;
      }
      get("daily-prev").disabled = page === 0;
      get("daily-next").disabled = !results.more;
      const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
      const cpc = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
      const amounts = row => [usd.format(row.spend), String(row.purchases), usd.format(row.revenue), usd.format((Math.round(row.revenue * 100) - Math.round(row.spend * 100)) / 100)];
      renderTable(teamTable, ["date", "spend", "orders", "revenue", "net"], results.team, row => [row.report_date, ...amounts(row)]);
      const canEditAnyRow = results.entries.some(row => row.user_id === active.user_id);
      const actionHeading = canEditAnyRow ? ["edit"] : [];
      renderTable(detailsTable,
        ["date", ...(isAdmin ? ["member"] : []), "offer", "platform", "cpc", "spend", "orders", "revenue", "net", ...actionHeading],
        results.entries,
        row => [
          row.report_date, ...(isAdmin ? [members.get(row.user_id) || "—"] : []), row.offer,
          row.platform === "facebook" ? "Facebook" : "NewsBreak", row.cpc == null ? "—" : cpc.format(row.cpc),
          ...amounts(row), ...(canEditAnyRow ? [row.user_id === active.user_id ? editButton(row) : "—"] : [])
        ]);
    }

    async function load() {
      if (!active || (collapsible && !root.open)) return;
      const current = ++request;
      results = null;
      listStatus = { key: "loading" };
      render();
      const offset = page * pageSize;
      let details = client.from("adrelay_daily_reports")
        .select("user_id,report_date,offer,platform,spend,cpc,purchases,revenue")
        .gte("report_date", range.from).lte("report_date", range.to)
        .order("report_date", { ascending: false }).order("offer").order("platform").order("user_id")
        .range(offset, offset + pageSize);
      if (range.offer) details = details.eq("offer", range.offer);
      if (active.role === "admin" && member.value) details = details.eq("user_id", member.value);
      try {
        const [entries, team] = await Promise.all([details, client.rpc("adrelay_daily_report_totals", {
          first_day: range.from, last_day: range.to, selected_offer: range.offer || null
        })]);
        if (current !== request) return;
        if (entries.error || team.error) throw entries.error || team.error;
        results = { entries: entries.data.slice(0, pageSize), team: team.data, more: entries.data.length > pageSize };
        listStatus = null;
      } catch {
        if (current !== request) return;
        listStatus = { key: "loadError", error: true };
      }
      render();
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!active || saving) return;
      const who = active.user_id;
      const fields = form.elements;
      const offer = fields.offer.value.trim().toLowerCase();
      const date = fields.date.value;
      if (!offer) {
        saveStatus = { key: "invalidOffer", error: true };
        status("daily-save-status", saveStatus);
        fields.offer.focus();
        return;
      }
      saving = true;
      submit.disabled = true;
      saveStatus = null;
      status("daily-save-status", null);
      try {
        const { error } = await client.rpc("adrelay_save_daily_report", {
          entry_date: date, entry_offer: offer, entry_platform: fields.platform.value, entry_spend: fields.spend.value,
          entry_cpc: fields.cpc.value || null, entry_purchases: Number(fields.purchases.value), entry_revenue: fields.revenue.value
        });
        if (error) throw error;
        if (active?.user_id !== who) return;
        saveStatus = { key: "saved" };
        if (date < range.from || date > range.to) {
          filter.elements.from.value = date;
          filter.elements.to.value = date;
          range = { ...range, from: date, to: date };
        }
        if (range.offer && range.offer !== offer) {
          filter.elements.offer.value = offer;
          range.offer = offer;
        }
        if (member.value && member.value !== who) member.value = who;
        page = 0;
        await load();
      } catch {
        if (active?.user_id === who) saveStatus = { key: "saveError", error: true };
      } finally {
        saving = false;
        submit.disabled = false;
        status("daily-save-status", saveStatus);
      }
    });
    filter.addEventListener("submit", event => {
      event.preventDefault();
      const from = filter.elements.from.value;
      const to = filter.elements.to.value;
      const days = (Date.parse(to) - Date.parse(from)) / 86400000;
      if (!(days >= 0 && days <= 365)) {
        listStatus = { key: "invalidDates", error: true };
        status("daily-list-status", listStatus);
        return;
      }
      range = { from, to, offer: filter.elements.offer.value.trim().toLowerCase() };
      page = 0;
      load();
    });
    member.addEventListener("change", () => { page = 0; load(); });
    get("daily-prev").addEventListener("click", () => { page--; load(); });
    get("daily-next").addEventListener("click", () => { page++; load(); });
    if (collapsible) root.addEventListener("toggle", () => { if (root.open) load(); });

    return {
      sync(profile, locale, roster) {
        const next = profile?.status === "active" ? profile : null;
        const switched = active?.user_id !== next?.user_id || active?.role !== next?.role;
        lang = locale;
        active = next;
        if (switched) {
          request++;
          if (collapsible) root.open = false;
          page = 0;
          results = null;
          saveStatus = null;
          listStatus = null;
          resetInputs();
        }
        updateMemberOptions(active?.role === "admin" ? roster : []);
        render();
        if (switched && !collapsible && active) load();
      }
    };
  };
})();
