(function () {
  "use strict";
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const outcomes = {
    received: "已收到",
    need_info: "需要补充",
    accepted: "已采纳",
    declined: "暂不采纳",
    resolved: "已解决",
  };
  const categories = {
    all: "全部",
    wish: "许愿",
    feedback: "反馈",
    bug: "报错",
    other: "其他",
  };
  window.FeedbackTools = {
    create(a) {
      const { root, prefix: p, state } = a;
      const files = new Map();
      let editing = false,
        lastData,
        listVersion = 0,
        searchTimer;
      const $ = (selector) => root.querySelector(selector);
      const draftKey = (id) => `${a.product}_feedback_reply_v2:${id}`;
      const replyForm = () => $(`.${p}-reply-form`);
      const control = (action, text, extra = "") =>
        `<button type="button" data-ft="${action}" ${extra}>${text}</button>`;
      function remember() {
        const form = replyForm();
        const id = state.thread?.id;
        if (!form || !id) return;
        localStorage.setItem(draftKey(id), form.elements.body.value);
        const file = form.elements.image?.files[0];
        if (file) files.set(id, file);
      }
      const dirty = () =>
        editing ||
        !!replyForm()?.elements.body.value ||
        !!replyForm()?.elements.image?.files[0];
      async function checkUpdates() {
        const thread = state.thread,
          credential = a.credential(thread?.id);
        if (!thread || !credential) return;
        try {
          const response = await a.request("/inbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              threads: [{ id: thread.id, token: credential.token }],
            }),
          });
          if (
            state.thread?.id === thread.id &&
            response.threads[0]?.updated_at > thread.updated_at
          )
            a.status("有新内容，草稿已保留；发送或取消修改后查看。");
        } catch (_) {
          /* Keep the composer intact when polling fails. */
        }
      }
      function restore() {
        const form = replyForm(),
          id = state.thread?.id;
        if (!form || !id) return;
        form.elements.body.value = localStorage.getItem(draftKey(id)) || "";
        if (files.has(id)) {
          const transfer = new DataTransfer();
          transfer.items.add(files.get(id));
          form.elements.image.files = transfer.files;
          form.elements.image.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        }
      }
      function messageBody(m) {
        if (m.state === "retracted")
          return `${m.sender === "admin" ? "作者" : "用户"}撤回了一条消息`;
        if (m.state === "removed") return "作者移除了一条消息";
        if (m.moderation === "pending" && !a.credential(state.thread?.id))
          return "内容待审核";
        return m.body;
      }
      function messageControls(m, credential) {
        const active = !m.state || m.state === "active";
        return `<div class="ft-message-footer"><span>${m.edited_at && active ? "已编辑" : ""}${m.moderation === "pending" && active && credential ? " · 待审核" : ""}</span>
          ${
            credential && m.sender === "visitor"
              ? `<details class="ft-message-menu"><summary aria-label="消息操作">···</summary><div>
          ${active ? control("edit", "修改", `data-message="${m.id}"`) + control("retract", "撤回", `data-message="${m.id}"`) : ""}${control("delete-message", "删除", `data-message="${m.id}"`)}</div></details>`
              : ""
          }</div>`;
      }
      function afterThread(data) {
        lastData = data;
        editing = false;
        const thread = data.thread;
        const info = $(`.${p}-thread-meta-bar`);
        info.insertAdjacentHTML(
          "afterend",
          `<details class="ft-result"><summary>处理结果 · ${outcomes[thread.outcome] || "已收到"}${thread.resolved_version ? " · " + esc(thread.resolved_version) : ""}</summary><p>${esc(thread.outcome_note || "作者尚未补充说明。")}</p>
          ${thread.outcome === "resolved" && a.credential(thread.id) ? `<div class="ft-actions">${control("result-resolved", "已解决")}${control("result-problem", "仍有问题")}</div>${thread.visitor_result === "resolved" ? "<p>你已确认解决。</p>" : ""}` : ""}</details>`,
        );
        restore();
        const form = replyForm();
        if (form) {
          form.elements.body.required = false;
          form.insertAdjacentHTML(
            "beforeend",
            `<div class="ft-image-tools">${control("clear-reply-image", "移除附图")}<span>文字草稿自动保存</span></div>`,
          );
        }
      }
      async function knowledge(host, version) {
        try {
          const data = await a.request(
            "/public/knowledge?product=" + a.product,
          );
          if (version !== listVersion || !host.isConnected) return;
          host.innerHTML = data.entries.length
            ? `<details class="ft-knowledge"><summary>已知问题与常见解答 · ${data.entries.length}</summary>${data.entries.map((entry) => `<details><summary>${esc(entry.title)}</summary><p>${esc(entry.body)}</p></details>`).join("")}</details>`
            : "";
        } catch (error) {
          if (host.isConnected)
            host.textContent = "常见解答暂时加载失败，可继续写信。";
        }
      }
      function afterList() {
        const host = $(`.${p}-hub`);
        if (!host) return;
        const version = ++listVersion;
        host.insertAdjacentHTML(
          "afterbegin",
          '<div class="ft-knowledge-host"></div>',
        );
        knowledge($(".ft-knowledge-host"), version);
        host.insertAdjacentHTML(
          "beforeend",
          `<details class="ft-transfer"><summary>迁移我的信箱</summary><p>凭证可以找回并操作你的信件，请自行保存。</p><div class="ft-actions">${control("export", "导出凭证")}<label class="ft-file-button">导入凭证<input type="file" data-ft-import accept="application/json,.json"></label>${a.product === "uwu" ? control("legacy", "查找旧版") : ""}</div><div class="ft-import-preview"></div></details>`,
        );
        if (state.mode === "public") {
          const list = $(`.${p}-public-list`);
          list.insertAdjacentHTML(
            "beforebegin",
            `<form class="ft-public-search"><input name="q" aria-label="搜索公开反馈" placeholder="搜索公开反馈" maxlength="80"><select name="category" aria-label="分类">${Object.entries(
              categories,
            )
              .map(([v, text]) => `<option value="${v}">${text}</option>`)
              .join("")}</select><button type="submit">查找</button></form>`,
          );
          $(".ft-public-search").onsubmit = (event) => {
            event.preventDefault();
            a.loadPublic(true);
          };
          $(".ft-public-search").elements.q.oninput = () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => a.loadPublic(true), 350);
          };
          $(".ft-public-search").elements.category.onchange = () =>
            a.loadPublic(true);
        }
      }
      const publicQuery = () => {
        const f = $(".ft-public-search");
        return new URLSearchParams({
          product: a.product,
          q: f?.elements.q.value || "",
          category: f?.elements.category.value || "all",
        });
      };
      function afterNew(draft = {}) {
        const form = $(`.${p}-new-form`);
        if (!form) return;
        const ua = navigator.userAgent;
        const browser = /Edg\//.test(ua)
          ? "Edge"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : "其他浏览器";
        const system = /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS/iPadOS"
            : /Windows/.test(ua)
              ? "Windows"
              : /Macintosh/.test(ua)
                ? "macOS"
                : "其他系统";
        const version =
          window.APP_VERSION ||
          document.querySelector('meta[name="application-version"]')?.content ||
          "未标记";
        const env = `${a.product.toUpperCase()}；版本 ${version}；${browser}；${system}；${matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "PWA" : "网页"}`;
        form
          .querySelector(`.${p}-challenge-section`)
          .insertAdjacentHTML(
            "beforebegin",
            `<details class="ft-bug-template" ${form.elements.category.value === "bug" ? "open" : ""}><summary>报错信息（选填）</summary><label>发生在哪个功能<input name="bug_feature" maxlength="100" value="${esc(draft.bug_feature || "")}"></label><label>操作步骤<textarea name="bug_steps" maxlength="1500">${esc(draft.bug_steps || "")}</textarea></label><label>预期结果<input name="bug_expected" maxlength="500" value="${esc(draft.bug_expected || "")}"></label><label>实际结果<input name="bug_actual" maxlength="500" value="${esc(draft.bug_actual || "")}"></label><label>环境信息（可编辑或清空）<input name="environment" maxlength="1000" value="${esc(draft.environment ?? env)}"></label></details>`,
          );
        const toggle = () => {
          $(".ft-bug-template").hidden = form.elements.category.value !== "bug";
        };
        toggle();
        form.addEventListener("change", toggle);
      }
      function prepareNew(data) {
        data.set("product", a.product);
        if (data.get("category") === "bug") {
          const fields = [
            ["bug_feature", "功能"],
            ["bug_steps", "步骤"],
            ["bug_expected", "预期"],
            ["bug_actual", "实际"],
          ];
          const body = [
            data.get("body"),
            ...fields
              .filter(([key]) => String(data.get(key) || "").trim())
              .map(
                ([key, title]) => `${title}：${String(data.get(key)).trim()}`,
              ),
          ].join("\n\n");
          if (body.length > 5000)
            throw Error("正文与报错信息合计不能超过 5000 字，请精简后投递。");
          data.set("body", body);
        } else data.delete("environment");
      }
      async function edit(m) {
        remember();
        a.clearChallenge();
        editing = true;
        const article = root
          .querySelector(`[data-message="${m.id}"]`)
          .closest("article");
        article.insertAdjacentHTML(
          "beforeend",
          `<form class="ft-edit-form"><label>修改内容<textarea name="body" maxlength="5000">${esc(m.body)}</textarea></label><label class="ft-file-button">替换附图<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>${m.attachment_key ? '<label class="ft-check"><input type="checkbox" name="removeImage" value="1">移除原附图</label>' : ""}<div class="${p}-challenge"></div><div class="ft-actions"><button type="submit">保存</button>${control("cancel-edit", "取消")}</div></form>`,
        );
        a.renderChallenge();
        article.querySelector(".ft-edit-form").onsubmit = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const form = event.target,
            b = form.querySelector("[type=submit]");
          if (b.disabled) return;
          b.disabled = true;
          try {
            const data = a.formData(form);
            data.set("version", m.version);
            await a.request(
              `/threads/${state.thread.id}/messages/${m.id}`,
              { method: "PATCH", body: data },
              a.credential(state.thread.id)?.token,
            );
            await a.openThread(state.thread.id, false);
            a.status(
              state.thread.kind === "public"
                ? "修改已保存，等待审核。"
                : "修改已保存。",
            );
          } catch (error) {
            a.status(error.message, true);
            if (window.turnstile && a.resetChallenge) a.resetChallenge();
          } finally {
            b.disabled = false;
          }
        };
      }
      root.addEventListener("input", remember);
      root.addEventListener("change", (event) => {
        remember();
        const input = event.target;
        if (!input.matches("[data-ft-import]") || !input.files[0]) return;
        (async () => {
          try {
            if (input.files[0].size > 200000) throw Error("凭证文件过大。");
            const data = JSON.parse(await input.files[0].text());
            if (
              data.format !== "feedback-credentials-v1" ||
              data.product !== a.product ||
              !Array.isArray(data.threads) ||
              data.threads.length > 1000
            )
              throw Error("请选择对应应用导出的凭证。");
            const valid = data.threads.filter(
              (item) =>
                /^[0-9a-f-]{36}$/i.test(item.id || "") &&
                /^[0-9a-f]{64}$/i.test(item.token || "") &&
                ["private", "public"].includes(item.kind),
            );
            if (valid.length !== data.threads.length)
              throw Error("凭证格式不正确。");
            const existing = new Map(a.owned().map((item) => [item.id, item]));
            let count = 0;
            for (let start = 0; start < valid.length; start += 30) {
              const confirmed = await a.request("/inbox", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  threads: valid
                    .slice(start, start + 30)
                    .map(({ id, token }) => ({ id, token })),
                }),
              });
              for (const remote of confirmed.threads) {
                if (remote.product !== a.product) continue;
                const item = valid.find((v) => v.id === remote.id);
                existing.set(remote.id, {
                  id: remote.id,
                  token: item.token,
                  kind: remote.kind,
                  title: remote.title,
                  seenAt: existing.get(remote.id)?.seenAt || 0,
                  updated_at: remote.updated_at,
                });
                count++;
              }
            }
            if (!count)
              throw Error("没有可恢复的信件，凭证可能失效或信件已删除。");
            if (
              !(await a.confirm(`找到 ${count} 封可恢复信件，导入当前信箱？`))
            )
              return;
            a.saveOwned([...existing.values()]);
            state.owned = a.owned();
            a.renderList();
            a.status(`已恢复 ${count} 封信件。`);
          } catch (error) {
            a.status(error.message, true);
          } finally {
            input.value = "";
          }
        })();
      });
      root.addEventListener(
        "click",
        (event) => {
          const b = event.target.closest("[data-ft]");
          if (!b) return;
          event.stopPropagation();
          if (b.disabled) return;
          (async () => {
            b.disabled = true;
            try {
              const action = b.dataset.ft,
                id = state.thread?.id;
              if (action === "legacy") {
                const old = JSON.parse(
                  localStorage.getItem("ephone_feedback_threads_v1") || "[]",
                );
                if (!Array.isArray(old)) throw Error("没有可识别的旧版凭证。");
                const valid = old.filter(
                  (item) =>
                    /^[0-9a-f-]{36}$/i.test(item.id || "") &&
                    /^[0-9a-f]{64}$/i.test(item.token || ""),
                );
                const found = [];
                for (let start = 0; start < valid.length; start += 30) {
                  const response = await a.request("/inbox", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      threads: valid
                        .slice(start, start + 30)
                        .map(({ id, token }) => ({ id, token })),
                    }),
                  });
                  for (const t of response.threads) {
                    if (t.product === a.product)
                      found.push({
                        ...valid.find((item) => item.id === t.id),
                        kind: t.kind,
                        title: t.title,
                      });
                  }
                }
                if (!found.length)
                  throw Error(
                    "没有找到已归为 UWU 的旧信件；来源错误的记录需由作者更正。",
                  );
                if (
                  !(await a.confirm(
                    `找到 ${found.length} 封旧信件，加入当前信箱？`,
                  ))
                )
                  return;
                const merged = new Map(a.owned().map((t) => [t.id, t]));
                found.forEach((t) => {
                  if (!merged.has(t.id)) merged.set(t.id, t);
                });
                a.saveOwned([...merged.values()]);
                state.owned = a.owned();
                a.renderList();
                a.status("旧版信件已恢复。");
                return;
              }
              if (action === "export") {
                const blob = new Blob(
                  [
                    JSON.stringify(
                      {
                        format: "feedback-credentials-v1",
                        product: a.product,
                        threads: a
                          .owned()
                          .map(({ id, token, kind }) => ({ id, token, kind })),
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                );
                await OvoFileDownload.save(blob, a.product + "-feedback-credentials.json");
                return;
              }
              if (action === "clear-reply-image") {
                const f = replyForm();
                f.elements.image.value = "";
                files.delete(id);
                f.elements.image.dispatchEvent(
                  new Event("change", { bubbles: true }),
                );
                return;
              }
              if (action === "cancel-edit") {
                await a.openThread(id, false);
                return;
              }
              if (action.startsWith("result-")) {
                await a.request(
                  "/threads/" + id + "/result",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      result:
                        action === "result-resolved" ? "resolved" : "problem",
                    }),
                  },
                  a.credential(id)?.token,
                );
                await a.openThread(id, false);
                a.status("处理结果已反馈给作者。");
                return;
              }
              const m = lastData.messages.find(
                (item) => item.id === b.dataset.message,
              );
              if (!m) return;
              if (action === "edit") {
                if (editing) {
                  a.status("请先保存或取消当前修改。", true);
                  return;
                }
                await edit(m);
                return;
              }
              if (
                !(await a.confirm(
                  action === "retract"
                    ? "撤回这条消息及附图，留下撤回提示？"
                    : "永久删除自己的这条消息及附图？",
                ))
              )
                return;
              await a.request(
                `/threads/${id}/messages/${m.id}${action === "retract" ? "/retract" : ""}`,
                {
                  method: action === "retract" ? "POST" : "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ version: m.version }),
                },
                a.credential(id)?.token,
              );
              await a.openThread(id, false);
            } catch (error) {
              a.status(error.message, true);
            } finally {
              b.disabled = false;
            }
          })();
        },
        true,
      );
      return {
        messageBody,
        messageControls,
        afterThread,
        afterList,
        afterNew,
        prepareNew,
        publicQuery,
        dirty,
        checkUpdates,
        remember,
        sent(id) {
          localStorage.removeItem(draftKey(id));
          files.delete(id);
        },
        reset() {
          editing = false;
        },
      };
    },
  };
})();
