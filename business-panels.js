(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const copy = {
    zh: {
      loading: "正在加载员工账号…", empty: "暂无员工申请", loadError: "暂时无法加载员工账号，请刷新名单。",
      pending: "待审核", active: "已开通", disabled: "已停用", code: "成员代号",
      approve: "开通", disable: "停用", restore: "恢复", saved: "已更新员工状态。",
      codeHint: "请输入 2–16 位的大写字母或数字。", saveError: "未能更新员工状态，请刷新名单后重试。"
    },
    en: {
      loading: "Loading employee accounts…", empty: "No employee applications yet", loadError: "Could not load employee accounts. Refresh the list to try again.",
      pending: "Pending approval", active: "Active", disabled: "Disabled", code: "Member code",
      approve: "Approve", disable: "Disable", restore: "Restore", saved: "Employee status updated.",
      codeHint: "Enter 2–16 uppercase letters or digits.", saveError: "Could not update employee status. Refresh the list and try again."
    }
  };

  window.createAdRelayBusinessPanels = function(client) {
    const root = document.documentElement;
    const reporting = window.createAdRelayDailyReports(client);
    const reportError = byId("reporting-load-error");
    const output = byId("management-roster");
    const status = byId("management-status");
    const refresh = byId("management-refresh");
    let account = null;
    let view = "";
    let revision = 0;
    let roster = [];
    let managementLoaded = false;
    let loading = false;
    let saving = false;
    let message = "";
    let reportSync = 0;

    const lang = () => root.dataset.lang === "en" ? "en" : "zh";
    const t = key => copy[lang()][key];
    const isAdmin = () => account?.role === "admin";
    const isCurrent = (request, role) => request === revision && account?.role === role;

    function renderManagement() {
      if (!isAdmin()) {
        output.replaceChildren();
        status.textContent = "";
        return;
      }
      refresh.disabled = loading || saving;
      status.textContent = message ? t(message) : "";
      status.toggleAttribute("data-error", message.endsWith("Error") || message === "codeHint");
      if (!managementLoaded) return;
      if (!roster.length) {
        output.textContent = t("empty");
        return;
      }
      output.replaceChildren(...roster.map(employee => {
        const row = document.createElement("article");
        row.className = "management-member";
        const summary = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = employee.display_name;
        const badge = document.createElement("span");
        badge.className = "management-status-badge";
        badge.dataset.state = employee.status;
        badge.textContent = t(employee.status);
        const details = document.createElement("small");
        details.textContent = [employee.email, employee.member_code].filter(Boolean).join(" · ");
        summary.append(name, badge, details);
        const form = document.createElement("form");
        const active = employee.status === "active";
        const input = document.createElement("input");
        input.value = employee.member_code || "";
        input.maxLength = 16;
        input.placeholder = t("code");
        input.setAttribute("aria-label", t("code") + " · " + employee.display_name);
        input.disabled = loading || saving;
        const button = document.createElement("button");
        button.textContent = t(active ? "disable" : employee.status === "pending" ? "approve" : "restore");
        button.disabled = loading || saving;
        if (!active) form.append(input);
        form.append(button);
        form.addEventListener("submit", event => {
          event.preventDefault();
          const code = input.value.trim().toUpperCase();
          if (!active && !/^[A-Z0-9]{2,16}$/.test(code)) {
            message = "codeHint";
            status.textContent = t(message);
            status.setAttribute("data-error", "");
            input.focus();
            return;
          }
          saveEmployee(employee, active ? { status: "disabled" } : { status: "active", member_code: code });
        });
        row.append(summary, form);
        return row;
      }));
    }

    async function loadManagement() {
      if (!isAdmin() || loading || saving) return;
      const request = revision;
      loading = true;
      message = "loading";
      renderManagement();
      try {
        const { data, error } = await client.from("adrelay_members")
          .select("user_id,email,display_name,status,member_code").eq("role", "employee").order("created_at");
        if (!isCurrent(request, "admin")) return;
        if (error) throw error;
        roster = data;
        managementLoaded = true;
        message = "";
      } catch {
        if (isCurrent(request, "admin")) message = "loadError";
      } finally {
        if (isCurrent(request, "admin")) {
          loading = false;
          renderManagement();
        }
      }
    }

    async function saveEmployee(employee, values) {
      if (!isAdmin() || loading || saving) return;
      const request = revision;
      saving = true;
      message = "";
      renderManagement();
      try {
        const { data, error } = await client.from("adrelay_members").update(values)
          .eq("user_id", employee.user_id).eq("status", employee.status)
          .select("user_id,email,display_name,status,member_code").single();
        if (!isCurrent(request, "admin")) return;
        if (error) throw error;
        roster = roster.map(row => row.user_id === data.user_id ? data : row);
        message = "saved";
      } catch {
        if (isCurrent(request, "admin")) message = "saveError";
      } finally {
        if (isCurrent(request, "admin")) {
          saving = false;
          renderManagement();
        }
      }
    }

    let reportRoster = [];
    async function showReporting() {
      if (!account) return;
      const request = ++reportSync;
      if (isAdmin()) {
        try {
          const { data, error } = await client.from("adrelay_members").select("user_id,display_name").order("display_name");
          if (request !== reportSync) return;
          if (error) throw error;
          reportRoster = data;
        } catch {
          if (request !== reportSync) return;
          reportError.hidden = false;
        }
      }
      reporting.sync(account, lang(), reportRoster);
    }

    refresh.addEventListener("click", loadManagement);
    window.addEventListener("adrelay:route", event => {
      if (event.detail === view) return;
      view = event.detail;
      if (!account) return;
      if (view === "daily") {
        reportError.hidden = true;
        showReporting();
      }
      if (view === "management") loadManagement();
    });
    window.addEventListener("adrelay:language", () => {
      if (!byId("daily-reports").hidden) reporting.sync(account, lang(), reportRoster);
      if (isAdmin() && view === "management") renderManagement();
    });

    return function setAccount(profile) {
      if (account?.user_id === profile?.user_id && account?.role === profile?.role) return;
      revision++;
      reportSync++;
      account = profile;
      roster = [];
      reportRoster = [];
      managementLoaded = loading = saving = false;
      message = "";
      reportError.hidden = true;
      reporting.sync(null, lang(), []);
      output.replaceChildren();
      renderManagement();
      if (!account) return;
      if (view === "daily") showReporting();
      if (view === "management") loadManagement();
    };
  };
})();
