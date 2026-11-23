(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let lang = params.get("lang");
  try {
    lang = lang || localStorage.getItem("adrelay-account-lang");
    if (localStorage.getItem("adrelay-theme") === "dark") document.documentElement.dataset.theme = "dark";
  } catch {}
  lang = lang === "en" ? "en" : "zh";
  const words = lang === "zh" ? {
    title: "每日填报", account: "我的账号", workspace: "工作台", results: "测试结果", signin: "前往账号页",
    checking: "正在验证账号…", signedOut: "请登录已开通的账号。", inactive: "账号还未开通日报权限。", failed: "暂时无法加载日报，请刷新后重试。"
  } : {
    title: "Daily reporting", account: "My account", workspace: "Workspace", results: "Test results", signin: "Go to accounts",
    checking: "Checking your account…", signedOut: "Sign in with an active account.", inactive: "Daily reporting is unavailable for this account.",
    failed: "Could not load daily reporting. Refresh to try again."
  };
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = "AdRelay · " + words.title;
  byId("reporting-title").textContent = words.title;
  const notice = byId("reporting-access");
  const message = byId("reporting-access-status");
  const signIn = byId("reporting-signin");
  const accountLink = byId("daily-account-link");
  const workspace = byId("daily-workspace-link");
  const results = byId("daily-results-link");
  signIn.href = "./account.html?view=daily&lang=" + lang;
  signIn.textContent = words.signin;
  accountLink.href = "./account.html?lang=" + lang;
  accountLink.textContent = words.account;
  workspace.href = "./?access=account&lang=" + lang + "#workspace";
  workspace.textContent = words.workspace;
  results.href = "./?access=account&lang=" + lang + "#results";
  results.textContent = words.results;

  const client = window.supabase?.createClient("https://sovltgzuzgsijebbtyms.supabase.co", "sb_publishable_3pcN0anu9HAIL2DD0gIQSQ_N3-JOgpZ");
  const daily = window.createAdRelayDailyReports?.(client);
  let revision = 0;
  let verifiedUser = null;

  function show(profile, roster, state) {
    const allowed = profile?.status === "active";
    notice.hidden = allowed;
    message.textContent = allowed ? "" : words[state];
    signIn.hidden = allowed || state === "checking";
    const admin = allowed && profile.role === "admin";
    workspace.hidden = !admin;
    results.hidden = !admin;
    daily?.sync(allowed ? profile : null, lang, roster);
  }

  if (!daily) {
    show(null, [], "failed");
    return;
  }
  show(null, [], "checking");
  client.auth.onAuthStateChange((event, session) => {
    const current = ++revision;
    const userId = session?.user?.id;
    if (!userId || event === "PASSWORD_RECOVERY") {
      verifiedUser = null;
      show(null, [], "signedOut");
      return;
    }
    if (userId !== verifiedUser) show(null, [], "checking");
    // Query after the Supabase auth callback releases its session lock.
    setTimeout(async () => {
      if (current !== revision) return;
      try {
        const profile = await client.from("adrelay_members")
          .select("user_id,display_name,role,status").eq("user_id", userId).maybeSingle();
        if (current !== revision) return;
        if (profile.error) throw profile.error;
        if (profile.data?.status !== "active") {
          verifiedUser = null;
          show(null, [], "inactive");
          return;
        }
        let roster = [];
        if (profile.data.role === "admin") {
          const members = await client.from("adrelay_members").select("user_id,display_name").order("display_name");
          if (current !== revision) return;
          if (members.error) throw members.error;
          roster = members.data;
        }
        verifiedUser = userId;
        show(profile.data, roster);
      } catch {
        if (current !== revision) return;
        verifiedUser = null;
        show(null, [], "failed");
      }
    }, 0);
  });
})();
