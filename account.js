(() => {
  "use strict";
  const words = {
    zh: {
      language: "语言", signin: "登录", signup: "注册", reset: "找回密码", recovery: "设置新密码",
      name: "姓名", email: "邮箱", password: "密码", newPassword: "新密码", confirmPassword: "确认新密码",
      passwordMismatch: "两次输入的密码不一致，请重新确认。", enroll: "提交账号资料",
      account: "我的账号", enter: "进入 AdRelay", teamEntry: "使用团队口令进入", refresh: "刷新状态", logout: "退出登录", members: "员工审核",
      pending: "等待管理员审核", active: "员工账号已开通", admin: "管理员账号已开通",
      disabled: "员工账号已停用", empty: "暂无员工申请", code: "成员代号",
      approve: "开通", disable: "停用", restore: "恢复", saved: "已保存",
      confirmation: "请查收验证邮件，验证后返回这里登录。", recoverySent: "如邮箱已有账号，请查收重置邮件。",
      unavailable: "账号服务暂时无法连接。", failed: "操作失败，请检查输入或稍后重试。",
      smtp: "验证邮件发送失败，请联系管理员确认发信设置。", invalid: "邮箱或密码有误，或邮箱尚未验证。",
      shortPassword: "新密码至少需要 12 个字符。", codeHint: "请输入 2–16 位的大写字母或数字。"
    },
    en: {
      language: "Language", signin: "Sign in", signup: "Register", reset: "Reset password", recovery: "Set a new password",
      name: "Name", email: "Email", password: "Password", newPassword: "New password", confirmPassword: "Confirm new password",
      passwordMismatch: "The passwords do not match. Please check both entries.", enroll: "Submit account details",
      account: "My account", enter: "Open AdRelay", teamEntry: "Enter with team passphrase", refresh: "Refresh status", logout: "Sign out", members: "Employee approvals",
      pending: "Awaiting admin approval", active: "Employee access is active", admin: "Administrator access is active",
      disabled: "Employee access is disabled", empty: "No employee applications yet", code: "Member code",
      approve: "Approve", disable: "Disable", restore: "Restore", saved: "Saved",
      confirmation: "Check your inbox to verify your email, then return here to sign in.",
      recoverySent: "If an account uses this email, check your inbox for the reset link.",
      unavailable: "The account service is temporarily unavailable.", failed: "The action failed. Check your input or try again.",
      smtp: "Verification email failed. Ask the administrator to check the email service.",
      invalid: "Invalid credentials or unverified email.", shortPassword: "Use at least 12 characters for your new password.",
      codeHint: "Enter 2–16 uppercase letters or digits."
    }
  };
  const byId = id => document.getElementById(id);
  const form = byId("auth-form");
  const confirmationField = byId("confirm-password-field");
  const confirmationInput = form.elements.namedItem("confirmPassword");
  const language = byId("language");
  const params = new URLSearchParams(location.search);
  const view = params.get("view") || "";
  const requestedView = /^[a-z0-9_-]{1,100}$/i.test(view) ? view : "";
  let lang = params.get("lang");
  try {
    lang = lang || localStorage.getItem("adrelay-account-lang");
    if (localStorage.getItem("adrelay-theme") === "dark") document.documentElement.dataset.theme = "dark";
  } catch {}
  lang = lang === "en" ? lang : "zh";
  language.value = lang;
  const t = key => words[lang][key];

  let mode = "signin";
  let session = null;
  let profile = null;
  let roster = [];
  let busy = false;
  let recovery = false;
  let loadingProfile = false;
  let message;
  const client = window.supabase?.createClient("https://sovltgzuzgsijebbtyms.supabase.co", "sb_publishable_3pcN0anu9HAIL2DD0gIQSQ_N3-JOgpZ");
  const redirect = new URL(location.pathname, location.origin).href;

  function workspaceUrl(access, defaultView) {
    const dest = new URL("./", redirect);
    dest.searchParams.set("access", access);
    dest.searchParams.set("lang", lang);
    dest.hash = requestedView || defaultView;
    return dest.href;
  }

  function notify(key, isError = false) {
    message = key ? { key, isError } : null;
    byId("message").textContent = key ? t(key) : "";
    byId("message").toggleAttribute("data-error", isError);
  }
  function render() {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.querySelectorAll("[data-text]").forEach(node => { node.textContent = t(node.dataset.text); });
    const signedIn = Boolean(session);
    const enrolling = signedIn && !profile && !recovery && !loadingProfile;
    const formMode = recovery ? "recovery" : enrolling ? "enroll" : mode;
    form.hidden = signedIn && !enrolling && !recovery;
    byId("auth-nav").hidden = signedIn || recovery;
    byId("profile").hidden = !signedIn || recovery;
    const isAdmin = signedIn && !recovery && profile?.role === "admin" && profile.status === "active";
    byId("members").hidden = !isAdmin;
    const entry = byId("enter-adrelay");
    if (entry) {
      entry.hidden = !isAdmin;
      entry.href = workspaceUrl("account", "workspace");
    }
    const teamEntry = byId("team-entry");
    if (teamEntry) {
      teamEntry.hidden = recovery || isAdmin;
      byId("team-entry-link").href = workspaceUrl("team", "");
    }
    byId("name-field").hidden = !["enroll", "signup"].includes(formMode);
    byId("email-field").hidden = ["enroll", "recovery"].includes(formMode);
    byId("password-field").hidden = ["enroll", "reset"].includes(formMode);
    form.elements.name.required = !byId("name-field").hidden;
    form.elements.email.required = !byId("email-field").hidden;
    form.elements.password.required = !byId("password-field").hidden;
    const isNewPassword = ["signup", "recovery"].includes(formMode);
    form.elements.password.autocomplete = isNewPassword ? "new-password" : "current-password";
    const passwordLabel = byId("password-label");
    if (passwordLabel) passwordLabel.textContent = t(isNewPassword ? "newPassword" : "password");
    if (confirmationField && confirmationInput) {
      confirmationField.hidden = !isNewPassword;
      confirmationInput.required = isNewPassword;
      confirmationInput.disabled = !isNewPassword;
    }
    byId("auth-submit").textContent = t(formMode);
    byId("auth-submit").disabled = !client || busy;
    byId("identity").textContent = profile ? profile.display_name + " · " + profile.email : (session?.user.email || "");
    byId("membership-status").textContent = profile ? t(profile.role === "admin" && profile.status === "active" ? "admin" : profile.status) : "";
    document.querySelectorAll("[data-mode]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.mode === mode)));
    renderRoster();
    if (message) notify(message.key, message.isError);
  }

  function renderRoster() {
    const output = byId("roster");
    output.replaceChildren();
    if (byId("members").hidden) return;
    if (!roster.length) output.textContent = t("empty");
    for (const employee of roster) {
      const row = document.createElement("article");
      row.className = "member";
      const summary = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = employee.display_name;
      const details = document.createElement("small");
      details.textContent = [employee.email, employee.member_code, t(employee.status)].filter(Boolean).join(" · ");
      summary.append(name, details);
      const controls = document.createElement("div");
      controls.className = "approval";
      const active = employee.status === "active";
      const code = document.createElement("input");
      code.value = employee.member_code || "";
      code.maxLength = 16;
      code.placeholder = t("code");
      code.setAttribute("aria-label", t("code") + " · " + employee.display_name);
      code.hidden = active;
      const button = document.createElement("button");
      button.textContent = t(active ? "disable" : employee.status === "pending" ? "approve" : "restore");
      button.disabled = busy;
      button.addEventListener("click", async () => {
        const memberCode = code.value.trim().toUpperCase();
        if (!active && !/^[A-Z0-9]{2,16}$/.test(memberCode)) {
          notify("codeHint", true);
          code.focus();
          return;
        }
        await act(async () => {
          const values = active ? { status: "disabled" } : { status: "active", member_code: memberCode };
          const { error } = await client.from("adrelay_members").update(values)
            .eq("user_id", employee.user_id).eq("status", employee.status).select("user_id").single();
          if (error) throw error;
          await loadProfile();
          notify("saved");
        });
      });
      controls.append(code, button);
      row.append(summary, controls);
      output.append(row);
    }
  }

  async function loadProfile() {
    if (!session || recovery) return;
    const requestedUser = session.user.id;
    const { data, error } = await client.from("adrelay_members")
      .select("user_id,email,display_name,role,status,member_code").eq("user_id", requestedUser).maybeSingle();
    if (requestedUser !== session?.user.id) return;
    if (error) throw error;
    profile = data;
    roster = [];
    if (!profile) form.elements.name.value = session.user.user_metadata?.display_name || "";
    if (profile?.role === "admin" && profile.status === "active") {
      const result = await client.from("adrelay_members").select("user_id,email,display_name,status,member_code")
        .eq("role", "employee").order("created_at");
      if (requestedUser !== session?.user.id) return;
      if (result.error) throw result.error;
      roster = result.data;
    }
  }
  async function act(run) {
    if (!client || busy) return;
    busy = true;
    notify();
    render();
    try {
      await run();
    } catch (error) {
      const detail = error?.message || "";
      const key = /email.*not authorized|sending.*email|smtp/i.test(detail) ? "smtp" :
        /invalid login credentials|email not confirmed/i.test(detail) ? "invalid" : "failed";
      notify(key, true);
    } finally {
      busy = false;
      render();
    }
  }
  language.addEventListener("change", () => {
    lang = language.value;
    try {
      localStorage.setItem("adrelay-account-lang", lang);
      localStorage.setItem("sync-lang", lang);
      const url = new URL(location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.set("lang", lang);
        history.replaceState(history.state, "", url);
      }
    } catch {}
    render();
  });
  function clearConfirmationError() {
    confirmationInput?.removeAttribute("aria-invalid");
    if (message?.key === "passwordMismatch") notify();
  }
  form.elements.password.addEventListener("input", clearConfirmationError);
  confirmationInput?.addEventListener("input", clearConfirmationError);
  document.querySelectorAll("[data-mode]").forEach(button => {
    button.addEventListener("click", () => {
      if (mode === button.dataset.mode) return;
      mode = button.dataset.mode;
      form.elements.password.value = "";
      if (confirmationInput) confirmationInput.value = "";
      clearConfirmationError();
      notify();
      render();
    });
  });
  byId("reload-account").addEventListener("click", () => act(loadProfile));
  byId("logout").addEventListener("click", () => act(async () => {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    if (!client || busy) return;
    const password = form.elements.password.value;
    const isNewPassword = recovery || (!session && mode === "signup");
    if (isNewPassword && password.length < 12) {
      notify("shortPassword", true);
      form.elements.password.focus();
      return;
    }
    if (isNewPassword && confirmationInput && password !== confirmationInput.value) {
      confirmationInput.setAttribute("aria-invalid", "true");
      notify("passwordMismatch", true);
      confirmationInput.focus();
      return;
    }
    form.elements.password.value = "";
    if (confirmationInput) confirmationInput.value = "";
    await act(async () => {
      let result;
      if (recovery) {
        result = await client.auth.updateUser({ password });
        if (!result.error) {
          recovery = false;
          await loadProfile();
          notify("saved");
        }
      } else if (session && !profile) {
        result = await client.rpc("adrelay_register_member", { requested_name: name });
        if (!result.error) await loadProfile();
      } else if (mode === "signup") {
        result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: { display_name: name } } });
        if (!result.error) notify("confirmation");
      } else if (mode === "reset") {
        result = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (!result.error) notify("recoverySent");
      } else {
        result = await client.auth.signInWithPassword({ email, password });
      }
      if (result?.error) throw result.error;
    });
  });

  if (client) {
    client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") recovery = true;
      if (!nextSession || nextSession.user.id !== session?.user.id) {
        profile = null;
        roster = [];
      }
      if (!nextSession) recovery = false;
      session = nextSession;
      if (["INITIAL_SESSION", "SIGNED_IN"].includes(event) && session && !recovery) {
        loadingProfile = true;
        setTimeout(async () => {
          try { await loadProfile(); }
          catch { notify("failed", true); }
          finally { loadingProfile = false; render(); }
        }, 0);
      }
      render();
    });
  } else notify("unavailable", true);
  render();
})();
