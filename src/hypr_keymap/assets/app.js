    (() => {
      const data = JSON.parse(document.querySelector("#bind-data").textContent);
      const bindings = data.bindings;
      const MODIFIERS = ["SUPER", "CTRL", "ALT", "SHIFT"];
      const MOD_LABELS = { SUPER: "Super", CTRL: "Ctrl", ALT: "Alt", SHIFT: "Shift" };
      const FLAG_LABELS = {
        repeating: "重复触发",
        locked: "锁屏可用",
        release: "松开触发",
        non_consuming: "事件透传",
        auto_consuming: "失败时透传",
        mouse: "鼠标绑定",
        transparent: "不可遮蔽",
        ignore_mods: "忽略修饰键",
        dont_inhibit: "绕过应用抑制",
        long_press: "长按触发",
        click: "点击触发",
        drag: "拖动触发",
        allow_input_capture: "输入捕获时可用",
        submap_universal: "全局 submap",
      };
      const MOD_TARGETS = {
        SUPER_LEFT: "SUPER", SUPER_RIGHT: "SUPER",
        CTRL_LEFT: "CTRL", CTRL_RIGHT: "CTRL",
        ALT_LEFT: "ALT", ALT_RIGHT: "ALT",
        SHIFT_LEFT: "SHIFT", SHIFT_RIGHT: "SHIFT",
      };
      const rows = [
        [
          { id: "ESCAPE", label: "Esc", width: 1.15 },
          ...Array.from({ length: 12 }, (_, index) => ({ id: `F${index + 1}`, label: `F${index + 1}` })),
        ],
        [
          { id: "`", label: "`", sub: "~" },
          ...[["1","!"],["2","@"],["3","#"],["4","$"],["5","%"],["6","^"],["7","&"],["8","*"],["9","("],["0",")"]].map(([id, sub]) => ({ id, label: id, sub })),
          { id: "-", label: "-", sub: "_" }, { id: "=", label: "=", sub: "+" },
          { id: "BACKSPACE", label: "Backspace", width: 2 },
        ],
        [
          { id: "TAB", label: "Tab", width: 1.5 },
          ...Array.from("QWERTYUIOP", (id) => ({ id, label: id })),
          { id: "[", label: "[", sub: "{" }, { id: "]", label: "]", sub: "}" },
          { id: "\\", label: "\\", sub: "|", width: 1.5 },
        ],
        [
          { id: "CAPS", label: "Caps", width: 1.75 },
          ...Array.from("ASDFGHJKL", (id) => ({ id, label: id })),
          { id: ";", label: ";", sub: ":" }, { id: "'", label: "'", sub: '"' },
          { id: "ENTER", label: "Enter", width: 2.25 },
        ],
        [
          { id: "SHIFT_LEFT", label: "Shift", width: 2.25 },
          ...Array.from("ZXCVBNM", (id) => ({ id, label: id })),
          { id: ",", label: ",", sub: "<" }, { id: ".", label: ".", sub: ">" },
          { id: "/", label: "/", sub: "?" }, { id: "SHIFT_RIGHT", label: "Shift", width: 2.75 },
        ],
        [
          { id: "CTRL_LEFT", label: "Ctrl", width: 1.25 },
          { id: "SUPER_LEFT", label: "Super", width: 1.25 },
          { id: "ALT_LEFT", label: "Alt", width: 1.25 },
          { id: "SPACE", label: "Space", width: 6.25 },
          { id: "ALT_RIGHT", label: "Alt", width: 1.25 },
          { id: "SUPER_RIGHT", label: "Super", width: 1.25 },
          { id: "MENU", label: "Menu", width: 1.25 },
          { id: "CTRL_RIGHT", label: "Ctrl", width: 1.25 },
        ],
      ];
      const navRows = [
        [{ id: "PRINT", label: "Print" }, { id: "SCROLL_LOCK", label: "ScrLk" }, { id: "PAUSE", label: "Pause" }],
        [{ id: "INSERT", label: "Ins" }, { id: "HOME", label: "Home" }, { id: "PAGE_UP", label: "PgUp" }],
        [{ id: "DELETE", label: "Del" }, { id: "END", label: "End" }, { id: "PAGE_DOWN", label: "PgDn" }],
        [{ spacer: true }, { id: "ARROW_UP", label: "↑" }, { spacer: true }],
        [{ id: "ARROW_LEFT", label: "←" }, { id: "ARROW_DOWN", label: "↓" }, { id: "ARROW_RIGHT", label: "→" }],
      ];
      const keyboard = document.querySelector("#keyboard");
      const allButtons = [];
      let selectedTarget = bindings.some((binding) => binding.key === "A") ? "A" : (bindings[0]?.key || "A");
      const defaultTarget = selectedTarget;
      const bindingById = new Map(bindings.map((binding) => [binding.id, binding]));
      const submapByName = new Map(data.submaps.map((submap) => [submap.name, submap]));
      let viewMode = "all";
      let activeSubmap = null;
      let searchQuery = "";
      let searchResults = [];

      const targetFor = (id) => MOD_TARGETS[id] || id;
      const keyLabel = (binding) => binding.raw_key && binding.raw_key.startsWith("code:") ? binding.key : binding.key;
      const displayTrigger = (value) => value
        .split(" + ")
        .map((part) => ({ press: "按下", release: "松开", long_press: "长按", click: "点击", drag: "拖动" }[part] || part))
        .join(" + ");
      const displaySubmap = (name, universal) => universal
        ? "全局生效（universal）"
        : name === "global" ? "全局" : name;
      const displayDevice = (value) => value
        .replace(/^all devices$/, "全部设备")
        .replace(/^only: /, "仅 ")
        .replace(/^except: /, "排除 ");
      const activeBindings = () => {
        if (viewMode === "search") {
          return searchResults;
        }
        if (viewMode === "overview") {
          return bindings;
        }
        if (viewMode === "submap") {
          return (submapByName.get(activeSubmap)?.binding_ids || [])
            .map((id) => bindingById.get(id))
            .filter(Boolean);
        }
        return bindings;
      };
      const matches = (target) => MODIFIERS.includes(target)
        ? activeBindings().filter((binding) => binding.mods.includes(target))
        : activeBindings().filter((binding) => binding.key === target);
      const keyMatches = (key) => activeBindings().filter((binding) => binding.key === key);
      const primary = (key) => keyMatches(key)[0];
      const duplicates = (key) => keyMatches(key).some((binding) => binding.duplicate_group !== null);

      function resetSearchState() {
        searchQuery = "";
        searchResults = [];
        document.querySelector("#bind-search").value = "";
        document.querySelector("#search-clear").hidden = true;
        document.querySelector("#search-count").textContent = `${bindings.length} BINDS`;
      }

      function bindingSearchText(binding) {
        return [
          binding.title,
          binding.short,
          binding.combo,
          binding.raw_key,
          binding.command,
          binding.action_path,
          binding.submap,
          binding.device_scope,
          ...binding.flags,
        ].join("\n").toLowerCase();
      }

      function applySearch(value) {
        searchQuery = value.trim().toLowerCase();
        document.querySelector("#search-clear").hidden = !searchQuery;
        if (!searchQuery) {
          resetSearchState();
          viewMode = "all";
          activeSubmap = null;
          selectedTarget = defaultTarget;
          renderDetail();
          return;
        }
        searchResults = bindings.filter((binding) => bindingSearchText(binding).includes(searchQuery));
        viewMode = "search";
        activeSubmap = null;
        selectedTarget = null;
        document.querySelector("#search-count").textContent = `${searchResults.length} / ${bindings.length}`;
        renderDetail();
      }

      function displayMatches(target) {
        if (viewMode === "submap" || viewMode === "search") {
          const inSubmap = keyMatches(target);
          if (inSubmap.length) {
            return inSubmap;
          }
        }
        if (viewMode === "overview") {
          const entryKeys = new Set(
            data.submaps
              .flatMap((submap) => submap.entry_binding_ids)
              .map((id) => bindingById.get(id))
              .filter(Boolean)
              .map((binding) => binding.key),
          );
          if (entryKeys.has(target)) {
            return bindings.filter((binding) => {
              if (binding.key !== target) return false;
              return data.submaps.some((submap) => submap.entry_binding_ids.includes(binding.id));
            });
          }
        }
        return bindings.filter((binding) => binding.key === target);
      }

      function submapForEntryTarget(target) {
        const found = data.submaps.filter((submap) =>
          submap.entry_binding_ids.some((id) => bindingById.get(id)?.key === target),
        );
        return found.length === 1 ? found[0].name : null;
      }

      function updateKeyboardHighlights() {
        const entryKeys = new Set();
        const entryModifiers = new Set();
        if (viewMode === "overview") {
          data.submaps.forEach((submap) => {
            submap.entry_binding_ids.forEach((id) => {
              const binding = bindingById.get(id);
              if (binding) {
                entryKeys.add(binding.key);
                binding.mods.forEach((modifier) => entryModifiers.add(modifier));
              }
            });
          });
        }
        const memberKeys = new Set(
          ["submap", "search"].includes(viewMode)
            ? activeBindings().map((binding) => binding.key)
            : [],
        );
        const memberModifiers = new Set(
          ["submap", "search"].includes(viewMode)
            ? activeBindings().flatMap((binding) => binding.mods)
            : [],
        );

        allButtons.forEach((button) => {
          const target = button.dataset.target;
          const isEntry = MODIFIERS.includes(target)
            ? entryModifiers.has(target)
            : entryKeys.has(target);
          const isMember = MODIFIERS.includes(target)
            ? memberModifiers.has(target)
            : memberKeys.has(target);
          button.classList.toggle("is-submap-entry", isEntry);
          button.classList.toggle("is-submap-member", isMember);
          button.classList.toggle(
            "is-context-dimmed",
            viewMode !== "all" && !isEntry && !isMember,
          );
          if (button.classList.contains("key")) {
            const shown = displayMatches(target);
            const count = shown.length;
            const first = shown[0];
            button.classList.toggle("has-binding", count > 0);
            button.classList.toggle("has-duplicate", !MODIFIERS.includes(target) && duplicates(target));
            const hint = button.querySelector(".key-hint");
            if (hint) {
              hint.textContent = count > 0 ? (first?.short || "") : "";
            }
            const badge = button.querySelector(".count");
            if (badge) {
              badge.hidden = count === 0;
              badge.textContent = count > 1 ? `+${count - 1}` : String(count);
            }
            if (!MODIFIERS.includes(target)) {
              const entrySubmap = viewMode === "overview" ? submapForEntryTarget(target) : null;
              button.title = entrySubmap
                ? `${target}：双击进入 ${entrySubmap}`
                : count
                ? `${target}：${shown.map((binding) => binding.title || "未提供 description").join("；")}`
                : `${target}：未绑定`;
            }
          }
        });
      }

      function updateModeBar() {
        const bar = document.querySelector("#keyboard-filter");
        const text = document.querySelector("#keyboard-filter-text");
        bar.hidden = viewMode === "all";
        if (viewMode === "overview") {
          text.textContent = `SUBMAPS：高亮全部 ${data.submaps.length} 个入口键；双击主键可进入对应 submap`;
        } else if (viewMode === "search") {
          text.textContent = `搜索：匹配 ${searchResults.length} 个绑定`;
        } else if (viewMode === "submap") {
          const count = submapByName.get(activeSubmap)?.binding_ids.length || 0;
          text.textContent = `SUBMAP ${activeSubmap}：高亮 ${count} 个按键`;
        }
      }

      function enterSubmapOverview() {
        resetSearchState();
        viewMode = "overview";
        activeSubmap = null;
        selectedTarget = null;
        renderDetail();
      }

      function enterSubmapContent(name) {
        resetSearchState();
        viewMode = "submap";
        activeSubmap = name;
        const first = (submapByName.get(name)?.binding_ids || [])
          .map((id) => bindingById.get(id))
          .find(Boolean);
        selectedTarget = first?.key || null;
        renderDetail();
      }

      function returnToGlobal() {
        resetSearchState();
        viewMode = "all";
        activeSubmap = null;
        selectedTarget = defaultTarget;
        renderDetail();
      }

      function makeKey(definition) {
        const target = targetFor(definition.id);
        const first = primary(target);
        const count = matches(target).length;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "key";
        button.dataset.target = target;
        button.style.setProperty("--w", definition.width || 1);
        button.setAttribute("aria-label", definition.label);
        button.classList.toggle("has-binding", count > 0);
        button.classList.toggle("has-duplicate", !MODIFIERS.includes(target) && duplicates(target));
        const label = document.createElement("span");
        label.className = "key-main";
        label.textContent = definition.label;
        const hint = document.createElement("span");
        hint.className = "key-hint";
        hint.textContent = count > 0 ? (first?.short || "") : "";
        const badge = document.createElement("span");
        badge.className = "count";
        badge.hidden = count === 0;
        badge.textContent = count > 1 ? `+${count - 1}` : String(count);
        button.append(label, hint, badge);
        button.title = count
          ? `${definition.label}：${matches(target).map((binding) => binding.title || "未提供 description").join("；")}`
          : `${definition.label}：未绑定`;
        button.addEventListener("click", () => select(target));
        button.addEventListener("dblclick", (event) => {
          if (viewMode !== "overview") return;
          const submap = submapForEntryTarget(target);
          if (submap) {
            event.preventDefault();
            enterSubmapContent(submap);
          }
        });
        allButtons.push(button);
        return button;
      }

      function renderKeyboard() {
        const body = document.createElement("div");
        body.className = "keyboard-body";
        const typing = document.createElement("div");
        for (const row of rows) {
          const element = document.createElement("div");
          element.className = "key-row";
          row.forEach((definition) => element.append(makeKey(definition)));
          typing.append(element);
        }
        const nav = document.createElement("div");
        nav.className = "nav-area";
        for (const row of navRows) {
          const element = document.createElement("div");
          element.className = "nav-row";
          row.forEach((definition) => {
            if (definition.spacer) {
              const spacer = document.createElement("span");
              spacer.className = "nav-spacer";
              element.append(spacer);
            } else {
              element.append(makeKey(definition));
            }
          });
          nav.append(element);
        }
        body.append(typing, nav);
        keyboard.append(body);
      }

      function renderExtraKeys() {
        const seen = new Set();
        const keys = bindings.filter((binding) => binding.system && !seen.has(binding.key) && seen.add(binding.key));
        for (const binding of keys) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "extra-key";
          button.dataset.target = binding.key;
          button.classList.toggle("has-duplicate", duplicates(binding.key));
          button.innerHTML = `<span class="extra-key-label"></span><span class="extra-key-code"></span>`;
          button.querySelector(".extra-key-label").textContent = binding.short;
          button.querySelector(".extra-key-code").textContent = binding.key.replace("XF86", "");
          button.title = `${binding.key}：${binding.title || "未提供 description"}`;
          button.addEventListener("click", () => select(binding.key));
          document.querySelector("#extra-keys").append(button);
          allButtons.push(button);
        }
      }

      function renderMouseKeys() {
        const seen = new Set();
        const keys = bindings.filter((binding) => binding.device === "mouse" && !seen.has(binding.key) && seen.add(binding.key));
        for (const binding of keys) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mouse-key";
          button.dataset.target = binding.key;
          button.classList.toggle("has-duplicate", duplicates(binding.key));
          const icon = binding.key === "mouse:272" ? "L" : binding.key === "mouse:273" ? "R" : binding.key === "mouse_up" ? "↑" : "↓";
          button.innerHTML = `<span class="mouse-icon">${icon}</span><span class="mouse-copy"><strong></strong><span></span></span>`;
          button.querySelector(".mouse-copy strong").textContent = binding.combo;
          button.querySelector(".mouse-copy span").textContent = binding.short;
          button.addEventListener("click", () => select(binding.key));
          document.querySelector("#mouse-keys").append(button);
          allButtons.push(button);
        }
      }

      function renderDiagnostics() {
        const root = document.querySelector("#diagnostics-list");
        const errors = data.stats.errors;
        const warnings = data.stats.warnings;
        document.querySelector("#diagnostics-summary").textContent = `${errors} ERRORS / ${warnings} WARNINGS / ${data.submaps.length} SUBMAPS`;
        if (!data.diagnostics.length) {
          root.innerHTML = `<div class="diagnostics-clean"><i>✓</i><span>未发现重复键位或明显配置问题。</span></div>`;
          return;
        }
        const list = document.createElement("div");
        list.className = "diagnostics-list";
        for (const issue of data.diagnostics) {
          const card = document.createElement("article");
          card.className = `diagnostic is-${issue.severity}`;
          const title = document.createElement("h3");
          title.className = "diagnostic-title";
          const severity = document.createElement("span");
          severity.className = "severity";
          severity.textContent = issue.severity === "error" ? "ERROR" : "WARN";
          title.append(severity, document.createTextNode(issue.title));
          const message = document.createElement("p");
          message.textContent = issue.message;
          const meta = document.createElement("div");
          meta.className = "diagnostic-meta";
          issue.lines.forEach((line) => {
            const item = document.createElement("span");
            item.textContent = `${data.source_name}:${line}`;
            meta.append(item);
          });
          card.append(title, message, meta);
          if (issue.key) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `查看 ${issue.key}`;
            button.addEventListener("click", () => select(issue.key));
            card.append(button);
          }
          list.append(card);
        }
        root.append(list);
      }

      function renderSubmapIndex() {
        const root = document.querySelector("#submap-index");
        const head = document.createElement("div");
        head.className = "submap-index-head";
        head.innerHTML = `<span>SUBMAP 导航</span><span>${data.submaps.length} 个模式 · 可滚动</span>`;

        const overview = document.createElement("button");
        overview.type = "button";
        overview.className = "submap-overview-button";
        overview.disabled = data.submaps.length === 0;
        overview.innerHTML = `
          <div><strong>查看全部 submap 入口</strong><span>保持完整键盘，同时高亮所有模式的进入键</span></div>
          <b>→</b>
        `;
        overview.addEventListener("click", enterSubmapOverview);
        root.append(head, overview);
        if (!data.submaps.length) {
          const empty = document.createElement("div");
          empty.className = "submap-empty";
          empty.textContent = "当前配置没有定义 submap。";
          root.append(empty);
          return;
        }

        const list = document.createElement("div");
        list.className = "submap-list";
        data.submaps.forEach((submap) => {
          const entries = submap.entry_binding_ids
            .map((id) => bindingById.get(id))
            .filter(Boolean);
          const card = document.createElement("button");
          card.type = "button";
          card.className = "submap-card";
          card.disabled = submap.binding_ids.length === 0;
          card.setAttribute("aria-label", `查看 ${submap.name} submap 的按键`);
          const name = document.createElement("strong");
          name.textContent = submap.name;
          const summary = document.createElement("span");
          summary.textContent = `${submap.binding_ids.length} 个按键 · ${entries.length} 个入口`;
          const shortcuts = document.createElement("code");
          shortcuts.textContent = entries.length
            ? entries.map((binding) => binding.combo).join(" / ")
            : "没有找到入口绑定";
          const cta = document.createElement("span");
          cta.className = "submap-card-cta";
          cta.textContent = "点击进入 →";
          card.append(name, summary, shortcuts, cta);
          card.addEventListener("click", () => enterSubmapContent(submap.name));
          list.append(card);
        });
        root.append(list);
      }

      function combo(binding) {
        const element = document.createElement("div");
        element.className = "combo";
        binding.mods.forEach((modifier, index) => {
          if (index > 0) {
            const plus = document.createElement("span");
            plus.className = "plus";
            plus.textContent = "+";
            element.append(plus);
          }
          const key = document.createElement("kbd");
          key.className = "mod";
          key.textContent = MOD_LABELS[modifier] || modifier;
          element.append(key);
        });
        if (binding.mods.length) {
          const plus = document.createElement("span");
          plus.className = "plus";
          plus.textContent = "+";
          element.append(plus);
        }
        const key = document.createElement("kbd");
        key.className = "main";
        key.textContent = keyLabel(binding);
        element.append(key);
        return element;
      }

      function bindingCard(binding) {
        const card = document.createElement("article");
        card.className = "binding-card";
        card.classList.toggle("is-duplicate", binding.duplicate_group !== null);
        card.append(combo(binding));

        const scope = document.createElement("div");
        scope.className = "binding-scope";
        [
          ["Submap", displaySubmap(binding.submap, binding.submap_universal)],
          ["Trigger", displayTrigger(binding.trigger_label)],
          ["Device", displayDevice(binding.device_scope)],
        ].forEach(([label, value]) => {
          const item = document.createElement("div");
          item.className = "binding-scope-item";
          const caption = document.createElement("span");
          caption.textContent = label;
          const content = document.createElement("strong");
          content.textContent = value;
          item.append(caption, content);
          scope.append(item);
        });
        const flagsSection = document.createElement("div");
        flagsSection.className = "binding-flags-section";
        const flagsLabel = document.createElement("span");
        flagsLabel.textContent = "Flags";
        const flagList = document.createElement("div");
        flagList.className = "flag-list";
        const extraFlags = binding.flags.filter(
          (flag) => !["submap_universal", "release", "long_press", "click", "drag"].includes(flag),
        );
        if (extraFlags.length) {
          extraFlags.forEach((flag) => {
            const item = document.createElement("span");
            item.className = "flag-pill";
            item.append(document.createTextNode(FLAG_LABELS[flag] || flag));
            const code = document.createElement("code");
            code.textContent = flag;
            item.append(code);
            flagList.append(item);
          });
        } else {
          const none = document.createElement("span");
          none.className = "flag-pill";
          none.textContent = "无额外 flags";
          flagList.append(none);
        }
        flagsSection.append(flagsLabel, flagList);
        const title = document.createElement("h3");
        title.className = "binding-title";
        title.textContent = binding.title || "未提供 description";
        title.classList.toggle("is-missing", !binding.title);
        if (binding.duplicate_group !== null) {
          const badge = document.createElement("span");
          badge.className = "bug-badge";
          badge.textContent = "重复";
          title.append(badge);
        }
        const detail = document.createElement("p");
        detail.className = "binding-detail";
        detail.textContent = binding.detail;
        detail.hidden = !binding.detail;
        const command = document.createElement("div");
        command.className = "command";
        command.innerHTML = `<span>→</span><code></code>`;
        command.querySelector("code").textContent = binding.command;
        const meta = document.createElement("div");
        meta.className = "binding-meta";
        meta.innerHTML = `<span></span><span></span>`;
        meta.children[0].textContent = `${data.source_name}:${binding.line}`;
        const sourceLabel = { description: "DESCRIPTION", missing: "NO DESCRIPTION" }[binding.annotation_source] || "NO DESCRIPTION";
        meta.children[1].textContent = binding.enabled
          ? `${binding.device === "mouse" ? "MOUSE BIND" : "HYPR BIND"} · ${sourceLabel}`
          : "DISABLED";
        card.append(title, detail, scope, flagsSection, command, meta);
        return card;
      }

      function updateStyles() {
        const highlighted = new Set();
        matches(selectedTarget).forEach((binding) => binding.mods.forEach((modifier) => highlighted.add(modifier)));
        allButtons.forEach((button) => {
          const target = button.dataset.target;
          button.classList.toggle("is-selected", target === selectedTarget);
          button.classList.toggle("is-modifier-highlight", target !== selectedTarget && highlighted.has(target));
          button.setAttribute("aria-pressed", String(target === selectedTarget));
        });
      }

      function renderDetail() {
        const list = document.querySelector("#binding-list");
        if (viewMode === "search" && searchQuery) {
          document.querySelector("#selected-cap").textContent = "⌕";
          document.querySelector("#current-selection").textContent = "—";
          document.querySelector("#detail-title").textContent = "搜索结果";
          document.querySelector("#detail-count").textContent = `${searchResults.length} BINDS`;
          document.querySelector("#detail-eyebrow").textContent = "SEARCH";
          document.querySelector("#detail-subtitle").textContent = `“${searchQuery}” 匹配描述、按键、命令、submap 或 flags`;
          list.replaceChildren();
          if (!searchResults.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.innerHTML = `<div><strong>没有匹配的绑定。</strong>尝试更短的描述、按键名称或 flag。</div>`;
            list.append(empty);
          } else {
            searchResults.forEach((binding) => list.append(bindingCard(binding)));
          }
          updateStyles();
          updateKeyboardHighlights();
          updateModeBar();
          return;
        }
        if (selectedTarget === null) {
          const overview = viewMode === "overview";
          document.querySelector("#selected-cap").textContent = overview ? "Σ" : "↓";
          document.querySelector("#current-selection").textContent = "—";
          document.querySelector("#detail-title").textContent = overview ? "全部 submap" : (activeSubmap || "submap");
          document.querySelector("#detail-count").textContent = overview ? `${data.submaps.length} SUBMAPS` : "0 BINDS";
          document.querySelector("#detail-eyebrow").textContent = overview ? "SUBMAP 总览" : "SUBMAP";
          document.querySelector("#detail-subtitle").textContent = overview
            ? "键盘保持完整布局，并高亮所有 submap 的入口键。"
            : "这个 submap 没有可用绑定。";
          list.replaceChildren();
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.innerHTML = overview
            ? `<div><strong>全部 submap 入口已高亮。</strong>点击任一入口键查看其绑定，或从下方的 submap 卡片进入成员视图。</div>`
            : `<div><strong>${activeSubmap} 没有按键。</strong>点击“返回全局”继续浏览。</div>`;
          list.append(empty);
          updateStyles();
          updateKeyboardHighlights();
          updateModeBar();
          return;
        }

        const found = matches(selectedTarget);
        const modifier = MODIFIERS.includes(selectedTarget);
        const title = modifier ? (MOD_LABELS[selectedTarget] || selectedTarget) : selectedTarget;
        document.querySelector("#selected-cap").textContent = title;
        document.querySelector("#current-selection").textContent = title;
        document.querySelector("#detail-title").textContent = title;
        document.querySelector("#detail-count").textContent = `${found.length} ${found.length === 1 ? "BIND" : "BINDS"}`;
        document.querySelector("#detail-eyebrow").textContent = modifier ? "修饰键筛选" : "按键组合";
        document.querySelector("#detail-subtitle").textContent = modifier
          ? `所有包含 ${title} 的组合`
          : found.length
            ? `这个键参与 ${found.length} 个按键组合`
            : viewMode === "submap"
              ? `当前 submap ${activeSubmap} 中没有这个键的绑定`
              : "这个键目前没有绑定功能";
        list.replaceChildren();
        if (!found.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.innerHTML = viewMode === "submap"
            ? `<div><strong>${title} 不在 ${activeSubmap} 中。</strong>当前 submap 没有这个键的绑定，可点击“返回全局”查看原配置。</div>`
            : `<div><strong>${title} 还没有绑定。</strong>点击其他带功能提示的键继续查看。</div>`;
          list.append(empty);
        } else {
          found.forEach((binding) => list.append(bindingCard(binding)));
        }
        updateStyles();
        updateKeyboardHighlights();
        updateModeBar();
      }

      function select(target) {
        selectedTarget = target;
        renderDetail();
        if (window.matchMedia("(max-width: 960px)").matches) {
          document.querySelector(".detail").scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      function renderStats() {
        document.querySelector("#source-path").textContent = data.source_path;
        document.querySelector("#generated-at").textContent = data.generated_at;
        document.querySelector("#case-label").textContent = `HYPRLAND // ${data.stats.bindings} BINDS`;
        document.querySelector("#stat-bindings").textContent = data.stats.bindings;
        document.querySelector("#stat-keys").textContent = data.stats.keys;
        document.querySelector("#stat-duplicates").textContent = data.stats.duplicate_groups;
        document.querySelector("#stat-warnings").textContent = data.stats.warnings;
        document.querySelector("#search-count").textContent = `${bindings.length} BINDS`;
        document.querySelector("#stat-duplicate-wrap").classList.toggle("is-bad", data.stats.duplicate_groups > 0);
        document.querySelector("#stat-duplicate-wrap").classList.toggle("is-good", data.stats.duplicate_groups === 0);
      }

      renderStats();
      renderKeyboard();
      renderExtraKeys();
      renderMouseKeys();
      renderDiagnostics();
      renderSubmapIndex();
      document.querySelector("#keyboard-filter-back").addEventListener("click", returnToGlobal);
      const searchInput = document.querySelector("#bind-search");
      searchInput.addEventListener("input", (event) => applySearch(event.target.value));
      searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          applySearch("");
          searchInput.blur();
        } else if (event.key === "Enter" && searchResults.length) {
          select(searchResults[0].key);
        }
      });
      document.querySelector("#search-clear").addEventListener("click", () => {
        applySearch("");
        searchInput.focus();
      });
      renderDetail();
    })();
