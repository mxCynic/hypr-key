    (() => {
      const I18N = window.HYPR_I18N || {};
      const SUPPORTED_LANGUAGES = ["en", "zh"];
      const LANGUAGE_STORAGE_KEY = "hypr-keymap-language";

      function readStoredLanguage() {
        try {
          const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
          return SUPPORTED_LANGUAGES.includes(stored) ? stored : null;
        } catch {
          return null;
        }
      }

      function readUrlLanguage() {
        try {
          const value = new URLSearchParams(location.hash.slice(1)).get("lang");
          return SUPPORTED_LANGUAGES.includes(value) ? value : null;
        } catch {
          return null;
        }
      }

      let locale = readUrlLanguage() || readStoredLanguage() || "en";

      function lookupTranslation(key) {
        const value = I18N[locale]?.[key] ?? I18N.en?.[key];
        return typeof value === "string" ? value : null;
      }

      function t(key, params = {}) {
        const template = lookupTranslation(key);
        if (template === null) return key;
        return template.replace(/\{(\w+)\}/g, (match, name) =>
          Object.hasOwn(params, name) ? String(params[name]) : match,
        );
      }

      function quantity(key, count, params = {}) {
        return t(`${key}.${count === 1 ? "one" : "other"}`, { ...params, count });
      }

      function storeLanguage(value) {
        try {
          window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
        } catch {
          // file:// or hardened browser profiles may disable localStorage.
        }
      }

      const data = JSON.parse(document.querySelector("#bind-data").textContent);
      const bindings = data.bindings;
      const MODIFIERS = ["SUPER", "CTRL", "ALT", "SHIFT"];
      const MOD_LABELS = { SUPER: "Super", CTRL: "Ctrl", ALT: "Alt", SHIFT: "Shift" };
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
      let activeSearchResult = 0;
      let searchFilter = "all";
      let searchOpen = false;
      let rovingKeyTarget = defaultTarget;
      let submapsExpanded = data.submaps.length <= 6;
      let restoringUrl = false;

      const targetFor = (id) => MOD_TARGETS[id] || id;
      const keyLabel = (binding) => binding.raw_key && binding.raw_key.startsWith("code:") ? binding.key : binding.key;
      const displayTrigger = (value) => value
        .split(" + ")
        .map((part) => lookupTranslation(`trigger.${part}`) !== null ? t(`trigger.${part}`) : part)
        .join(" + ");
      const displaySubmap = (name, universal) => universal
        ? t("submap.universal")
        : name === "global" ? t("submap.global") : name;
      const displayDevice = (value) => value
        .replace(/^all devices$/, () => t("device.all"))
        .replace(/^no devices$/, () => t("device.none"))
        .replace(/^only: (.*)$/, (_, devices) => t("device.only", { devices }))
        .replace(/^except: (.*)$/, (_, devices) => t("device.except", { devices }));
      const displaySource = (value) => {
        const root = data.source_path.replace(/[\\/][^\\/]*$/, "");
        if (root && value.startsWith(`${root}/`)) return value.slice(root.length + 1);
        return value || data.source_name;
      };
      const flagLabel = (flag) => {
        const key = `flag.${flag}`;
        return lookupTranslation(key) !== null ? t(key) : flag;
      };
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

      function updateSearchCount() {
        const count = document.querySelector("#search-count");
        count.textContent = viewMode === "search"
          ? `${searchResults.length} / ${bindings.length}`
          : quantity("unit.bind", bindings.length);
      }

      function resetSearchState() {
        searchQuery = "";
        searchResults = [];
        searchFilter = "all";
        searchOpen = false;
        activeSearchResult = 0;
        document.querySelector("#bind-search").value = "";
        document.querySelector("#bind-search").setAttribute("aria-expanded", "false");
        document.querySelector("#bind-search").removeAttribute("aria-activedescendant");
        document.querySelector("#search-clear").hidden = true;
        document.querySelector("#search-count").textContent =
          quantity("unit.bind", bindings.length);
        closeSearchPopover();
        updateSearchFilterButtons();
      }

      function parseSearchTerms(value) {
        return (value.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((term) =>
          term.replace(/^"|"$/g, ""),
        );
      }

      function isChordToken(token) {
        const value = token.toLowerCase();
        return MODIFIERS.includes(value.toUpperCase())
          || /^f(?:[1-9]|1[0-2])$/.test(value)
          || /^[a-z0-9;,./\\'\[\]`=-]$/.test(value)
          || ["space", "tab", "escape", "print", "enter", "backspace", "delete", "insert", "home", "end", "page_up", "page_down", "arrow_up", "arrow_down", "arrow_left", "arrow_right"].includes(value)
          || /^mouse(?::|_)/.test(value)
          || /^xf86/.test(value);
      }

      function parseChordQuery(value) {
        const tokens = value
          .trim()
          .toLowerCase()
          .replace(/\+/g, " ")
          .split(/\s+/)
          .filter(Boolean);
        return tokens.length >= 2 && tokens.every(isChordToken) ? tokens : null;
      }

      function bindingKeyTokens(binding) {
        return [...binding.mods, binding.key].map((token) => token.toLowerCase());
      }

      function bindingSearchValues(binding) {
        return {
          key: `${binding.combo} ${binding.raw_key} ${binding.key}`.toLowerCase(),
          desc: `${binding.title} ${binding.short}`.toLowerCase(),
          submap: binding.submap.toLowerCase(),
          flag: binding.flags.join(" ").toLowerCase(),
          device: binding.device_scope.toLowerCase(),
          command: binding.command.toLowerCase(),
          action: binding.action_path.toLowerCase(),
        };
      }

      function bindingMatchesTerm(binding, term) {
        const values = bindingSearchValues(binding);
        const colon = term.indexOf(":");
        const rawField = colon > 0 ? term.slice(0, colon).toLowerCase() : "";
        const aliases = { description: "desc", flags: "flag" };
        const field = aliases[rawField] || rawField;
        const value = (colon > 0 && values[field] !== undefined ? term.slice(colon + 1) : term).toLowerCase();
        if (!value) return true;
        if (field === "key" && values[field] !== undefined) {
          const chord = parseChordQuery(value);
          if (chord) {
            const keyTokens = bindingKeyTokens(binding);
            return chord.every((token) => keyTokens.includes(token));
          }
          return values.key.replace(/\s+/g, "").includes(value.replace(/\s+/g, ""));
        }
        return (values[field] || Object.values(values).join("\n")).includes(value);
      }

      function searchFilterMatches(binding) {
        if (searchFilter === "global") {
          return binding.submap_universal || binding.submap === "global";
        }
        if (searchFilter === "submap") {
          return Boolean(activeSubmap) && binding.submap === activeSubmap;
        }
        if (searchFilter === "flags") return binding.flags.length > 0;
        if (searchFilter === "duplicates") return binding.duplicate_group !== null;
        if (searchFilter === "keyboard") return binding.device === "keyboard";
        if (searchFilter === "mouse") return binding.device === "mouse";
        return true;
      }

      function searchScore(binding, query, terms) {
        const compact = query.replace(/\s+/g, "").toLowerCase();
        const combo = binding.combo.replace(/\s+/g, "").toLowerCase();
        const title = (binding.title || "").toLowerCase();
        const command = binding.command.toLowerCase();
        let score = 0;
        const chord = parseChordQuery(query);
        if (chord) {
          const keyTokens = bindingKeyTokens(binding);
          if (keyTokens.length === chord.length) score += 200;
          else score += Math.max(1, 100 - keyTokens.length * 5);
        }
        if (compact && combo === compact) score += 100;
        if (compact && binding.key.toLowerCase() === compact) score += 80;
        if (query && title === query) score += 70;
        else if (query && title.startsWith(query)) score += 50;
        else if (query && title.includes(query)) score += 30;
        if (query && command.includes(query)) score += 10;
        score += terms.length * 2;
        return score;
      }

      function computeSearchResults(value) {
        const query = value.trim().toLowerCase();
        const terms = parseSearchTerms(query);
        const chord = parseChordQuery(query);
        return bindings
          .filter(searchFilterMatches)
          .filter((binding) => {
            if (chord) {
              const keyTokens = bindingKeyTokens(binding);
              return chord.every((token) => keyTokens.includes(token));
            }
            return terms.every((term) => bindingMatchesTerm(binding, term));
          })
          .map((binding) => ({ binding, score: searchScore(binding, query, terms) }))
          .sort((left, right) => right.score - left.score || left.binding.line - right.binding.line)
          .map((item) => item.binding);
      }

      function appendHighlightedText(parent, text, terms) {
        const plainTerms = terms
          .filter((term) => !term.includes(":"))
          .sort((left, right) => right.length - left.length);
        if (!plainTerms.length) {
          parent.textContent = text;
          return;
        }
        const escaped = plainTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
        parts.forEach((part) => {
          if (plainTerms.some((term) => part.toLowerCase() === term.toLowerCase())) {
            const mark = document.createElement("mark");
            mark.textContent = part;
            parent.append(mark);
          } else if (part) {
            parent.append(document.createTextNode(part));
          }
        });
      }

      function closeSearchPopover() {
        searchOpen = false;
        document.querySelector("#search-popover").hidden = true;
        document.querySelector("#bind-search").setAttribute("aria-expanded", "false");
        document.querySelector("#bind-search").removeAttribute("aria-activedescendant");
      }

      function openSearchPopover() {
        if (!searchQuery && searchFilter === "all") return;
        searchOpen = true;
        document.querySelector("#search-popover").hidden = false;
        document.querySelector("#bind-search").setAttribute("aria-expanded", "true");
        renderSearchPopover();
        setActiveSearchResult(activeSearchResult);
      }

      function renderSearchPopover() {
        const root = document.querySelector("#search-results");
        root.replaceChildren();
        document.querySelector("#search-popover-count").textContent =
          quantity("unit.result", searchResults.length);
        if (!searchResults.length) {
          const empty = document.createElement("div");
          empty.className = "search-popover-empty";
          empty.textContent = t("search.none");
          root.append(empty);
          return;
        }
        const terms = parseSearchTerms(searchQuery);
        searchResults.forEach((binding, index) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "search-result-row";
          row.id = `search-option-${binding.id}`;
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", String(index === activeSearchResult));
          row.classList.toggle("is-active", index === activeSearchResult);
          const combo = document.createElement("span");
          combo.className = "search-result-combo";
          combo.textContent = binding.combo;
          const copy = document.createElement("span");
          copy.className = "search-result-copy";
          const title = document.createElement("strong");
          appendHighlightedText(title, binding.title || t("binding.noDescription"), terms);
          const detail = document.createElement("span");
          detail.textContent = displaySubmap(binding.submap, binding.submap_universal);
          copy.append(title, detail);
          const meta = document.createElement("span");
          meta.className = "search-result-meta";
          meta.textContent = binding.flags.length
            ? binding.flags
              .filter((flag) => flag !== "submap_universal")
              .map(flagLabel)
              .join(" · ")
            : displayDevice(binding.device_scope);
          row.append(combo, copy, meta);
          row.addEventListener("click", () => commitSearchResult(binding));
          root.append(row);
        });
      }

      function setActiveSearchResult(index) {
        const rows = [...document.querySelectorAll("#search-results .search-result-row")];
        if (!rows.length) {
          document.querySelector("#bind-search").removeAttribute("aria-activedescendant");
          return;
        }
        activeSearchResult = Math.max(0, Math.min(rows.length - 1, index));
        rows.forEach((row, rowIndex) => {
          const active = rowIndex === activeSearchResult;
          row.classList.toggle("is-active", active);
          row.setAttribute("aria-selected", String(active));
        });
        const active = rows[activeSearchResult];
        document.querySelector("#bind-search").setAttribute("aria-activedescendant", active.id);
        if (searchOpen) active.scrollIntoView({ block: "nearest" });
      }

      function applySearch(value) {
        searchQuery = value.trim().toLowerCase();
        document.querySelector("#search-clear").hidden = !value.trim();
        if (!searchQuery && searchFilter === "all") {
          resetSearchState();
          viewMode = "all";
          activeSubmap = null;
          selectedTarget = defaultTarget;
          renderDetail();
          syncUrl(false);
          return;
        }
        searchResults = computeSearchResults(value);
        viewMode = "search";
        selectedTarget = null;
        activeSearchResult = 0;
        updateSearchCount();
        renderDetail();
        openSearchPopover();
        syncUrl(false);
      }

      function commitSearchResult(binding) {
        viewMode = "search";
        selectedTarget = binding.key;
        closeSearchPopover();
        renderDetail();
        document.querySelector("#detail-title").focus();
        syncUrl(true);
      }

      function updateSearchFilterButtons() {
        document.querySelectorAll(".search-filter").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.filter === searchFilter);
          button.disabled = button.dataset.filter === "submap" && !activeSubmap;
        });
      }

      function syncUrl(push = false) {
        if (restoringUrl) return;
        const params = new URLSearchParams();
        if (locale !== "en") params.set("lang", locale);
        if (searchQuery) params.set("q", searchQuery);
        if (searchFilter !== "all") params.set("filter", searchFilter);
        if (viewMode === "submap" && activeSubmap) params.set("submap", activeSubmap);
        if (viewMode === "overview") params.set("view", "submaps");
        if (selectedTarget) params.set("key", selectedTarget);
        const hash = params.toString();
        const url = `${location.pathname}${location.search}${hash ? `#${hash}` : ""}`;
        try {
          history[push ? "pushState" : "replaceState"]({}, "", url);
        } catch {
          // Some local-file browser configurations disallow history changes.
        }
      }

      function restoreFromUrl() {
        if (!location.hash) return;
        restoringUrl = true;
        const params = new URLSearchParams(location.hash.slice(1));
        const urlLanguage = params.get("lang");
        let languageChanged = false;
        if (SUPPORTED_LANGUAGES.includes(urlLanguage) && urlLanguage !== locale) {
          locale = urlLanguage;
          languageChanged = true;
        }
        resetSearchState();
        searchFilter = params.get("filter") || "all";
        const submap = params.get("submap");
        const key = params.get("key");
        const query = params.get("q") || "";
        if (submap && submapByName.has(submap)) {
          viewMode = "submap";
          activeSubmap = submap;
          selectedTarget = key || submapByName.get(submap)?.binding_ids
            .map((id) => bindingById.get(id))
            .find(Boolean)?.key || null;
        } else if (params.get("view") === "submaps") {
          viewMode = "overview";
          activeSubmap = null;
          selectedTarget = null;
        } else if (query || searchFilter !== "all") {
          document.querySelector("#bind-search").value = query;
          searchQuery = query.toLowerCase();
          searchResults = computeSearchResults(query);
          viewMode = "search";
          selectedTarget = key || null;
        } else {
          viewMode = "all";
          activeSubmap = null;
          selectedTarget = key || defaultTarget;
        }
        updateSearchFilterButtons();
        if (languageChanged) {
          refreshLocalizedSections();
        } else {
          renderDetail();
          if (searchOpen) renderSearchPopover();
        }
        restoringUrl = false;
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

      function submapExitForBinding(binding) {
        if (
          binding.submap !== activeSubmap
          || !binding.action_path.endsWith(".submap")
          || !Array.isArray(binding.action_args)
          || !binding.action_args.length
        ) {
          return null;
        }
        return String(binding.action_args[0]);
      }

      function submapExitForTarget(target) {
        if (viewMode !== "submap") return null;
        const match = activeBindings().find(
          (binding) => binding.key === target && submapExitForBinding(binding),
        );
        return match ? submapExitForBinding(match) : null;
      }

      function mainKeyButtons() {
        return allButtons.filter((button) => button.classList.contains("key"));
      }

      function setRovingKey(target, focus = false) {
        rovingKeyTarget = target;
        mainKeyButtons().forEach((button) => {
          const active = button.dataset.target === target;
          button.tabIndex = active ? 0 : -1;
          button.setAttribute("aria-selected", String(active));
        });
        if (focus) {
          mainKeyButtons()
            .find((button) => button.dataset.target === target)
            ?.focus();
        }
      }

      function navigateKeyGrid(current, direction) {
        const currentRect = current.getBoundingClientRect();
        const currentX = currentRect.left + currentRect.width / 2;
        const currentY = currentRect.top + currentRect.height / 2;
        const candidates = mainKeyButtons().filter((button) => {
          if (button === current || button.classList.contains("is-context-dimmed")) {
            return false;
          }
          const rect = button.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (direction === "left") return x < currentX - 1;
          if (direction === "right") return x > currentX + 1;
          if (direction === "up") return y < currentY - 1;
          return y > currentY + 1;
        });
        const scored = candidates.map((button) => {
          const rect = button.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const dx = Math.abs(x - currentX);
          const dy = Math.abs(y - currentY);
          const primary = direction === "left" || direction === "right" ? dx : dy;
          const cross = direction === "left" || direction === "right" ? dy : dx;
          return { button, score: primary + cross * 2.5 };
        });
        scored.sort((left, right) => left.score - right.score);
        if (scored.length) {
          setRovingKey(scored[0].button.dataset.target, true);
        }
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
        const exitKeys = new Set();
        const exitModifiers = new Set();
        if (viewMode === "submap") {
          activeBindings().forEach((binding) => {
            if (!submapExitForBinding(binding)) return;
            exitKeys.add(binding.key);
            binding.mods.forEach((modifier) => exitModifiers.add(modifier));
          });
        }
        const activeMainTargets = [];

        allButtons.forEach((button) => {
          const target = button.dataset.target;
          const modifierTarget = MODIFIERS.includes(target);
          const isEntry = modifierTarget
            ? entryModifiers.has(target)
            : entryKeys.has(target);
          const isMember = modifierTarget
            ? memberModifiers.has(target)
            : memberKeys.has(target);
          const isExit = modifierTarget
            ? exitModifiers.has(target)
            : exitKeys.has(target);
          button.classList.toggle("is-submap-entry", isEntry);
          button.classList.toggle("is-submap-exit", isExit);
          button.classList.toggle("is-submap-entry-modifier", modifierTarget && isEntry);
          button.classList.toggle("is-submap-exit-modifier", modifierTarget && isExit);
          button.classList.toggle(
            "is-context-dimmed",
            viewMode !== "all" && !isEntry && !isMember,
          );
          if (button.classList.contains("key")) {
            if (viewMode === "all" || isEntry || isMember) {
              activeMainTargets.push(target);
            }
            const shown = modifierTarget ? [] : displayMatches(target);
            const count = shown.length;
            const first = shown[0];
            const hasBinding = modifierTarget ? matches(target).length > 0 : count > 0;
            button.classList.toggle("has-binding", hasBinding);
            button.classList.toggle("has-duplicate", !modifierTarget && duplicates(target));
            const hint = button.querySelector(".key-hint");
            if (hint) {
              hint.textContent = !modifierTarget && count > 0 ? (first?.short || "") : "";
            }
            const badge = button.querySelector(".count");
            if (badge) {
              badge.hidden = modifierTarget || count === 0;
              badge.textContent = count > 1 ? `+${count - 1}` : String(count);
            }
            if (!modifierTarget) {
              const entrySubmap = viewMode === "overview" ? submapForEntryTarget(target) : null;
              const spokenKey = target === "SPACE" ? "Space" : target;
              const descriptions = shown
                .map((binding) => binding.title || t("binding.noDescription"))
                .slice(0, 2)
                .join(t("common.semicolon"));
              const shownDescriptions = shown
                .map((binding) => binding.title || t("binding.noDescription"))
                .join(t("common.semicolon"));
              const modeDescription = entrySubmap
                ? t("keyboard.entryMode", { name: entrySubmap })
                : viewMode === "submap"
                  ? isExit
                    ? t("keyboard.exitMode", { name: activeSubmap })
                    : t("keyboard.memberMode", { name: activeSubmap })
                  : "";
              const extraDescription = count > 2
                ? t("keyboard.moreCombinations", { count: count - 2 })
                : "";
              button.setAttribute(
                "aria-label",
                count > 0
                  ? t("keyboard.keyAria", {
                    key: spokenKey,
                    descriptions,
                    extra: extraDescription,
                    mode: modeDescription,
                  })
                  : t("keyboard.unboundAria", { key: spokenKey }),
              );
              button.title = entrySubmap
                ? t("keyboard.entryTitle", { key: target, name: entrySubmap })
                : isExit
                  ? t("keyboard.exitTitle", { key: target })
                : count
                ? t("keyboard.boundTitle", { key: target, descriptions: shownDescriptions })
                : t("keyboard.unboundTitle", { key: target });
            } else {
              const modifierCount = matches(target).length;
              button.setAttribute(
                "aria-label",
                quantity("keyboard.modifierAria", modifierCount, {
                  name: MOD_LABELS[target] || target,
                }),
              );
            }
          } else {
            button.tabIndex = button.classList.contains("is-context-dimmed")
              ? -1
              : 0;
          }
        });
        if (!activeMainTargets.includes(rovingKeyTarget)) {
          rovingKeyTarget = activeMainTargets[0] || defaultTarget;
        }
        setRovingKey(rovingKeyTarget);
      }

      function updateModeBar() {
        const bar = document.querySelector("#keyboard-filter");
        const text = document.querySelector("#keyboard-filter-text");
        bar.hidden = viewMode === "all";
        if (viewMode === "overview") {
          text.textContent = quantity("mode.overview", data.submaps.length);
        } else if (viewMode === "search") {
          text.textContent = quantity("mode.search", searchResults.length);
        } else if (viewMode === "submap") {
          const count = submapByName.get(activeSubmap)?.binding_ids.length || 0;
          text.textContent = quantity("mode.submap", count, { name: activeSubmap });
        }
      }

      function enterSubmapOverview() {
        resetSearchState();
        viewMode = "overview";
        activeSubmap = null;
        selectedTarget = null;
        renderDetail();
        syncUrl(true);
      }

      function enterSubmapContent(name) {
        resetSearchState();
        viewMode = "submap";
        activeSubmap = name;
        const first = (submapByName.get(name)?.binding_ids || [])
          .map((id) => bindingById.get(id))
          .find(Boolean);
        selectedTarget = first?.key || null;
        updateSearchFilterButtons();
        renderDetail();
        syncUrl(true);
      }

      function returnToGlobal() {
        resetSearchState();
        viewMode = "all";
        activeSubmap = null;
        selectedTarget = defaultTarget;
        renderDetail();
        syncUrl(true);
      }

      function makeKey(definition) {
        const target = targetFor(definition.id);
        const first = primary(target);
        const count = matches(target).length;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "key";
        button.tabIndex = -1;
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-selected", "false");
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
        button.title = MODIFIERS.includes(target)
          ? quantity("keyboard.modifierAria", matches(target).length, {
            name: MOD_LABELS[target] || definition.label,
          })
          : count
            ? t("keyboard.boundTitle", {
              key: definition.label,
              descriptions: matches(target)
                .map((binding) => binding.title || t("binding.noDescription"))
                .join(t("common.semicolon")),
            })
            : t("keyboard.unboundTitle", { key: definition.label });
        button.addEventListener("click", () => {
          setRovingKey(target);
          select(target);
        });
        button.addEventListener("focus", () => setRovingKey(target));
        button.addEventListener("keydown", (event) => {
          const directions = {
            ArrowLeft: "left",
            ArrowRight: "right",
            ArrowUp: "up",
            ArrowDown: "down",
          };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            navigateKeyGrid(button, direction);
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            const active = mainKeyButtons().filter(
              (item) => !item.classList.contains("is-context-dimmed"),
            );
            const destination = event.key === "Home" ? active[0] : active.at(-1);
            if (destination) setRovingKey(destination.dataset.target, true);
          }
        });
        button.addEventListener("dblclick", (event) => {
          if (viewMode === "submap") {
            const exitTarget = submapExitForTarget(target);
            if (exitTarget) {
              event.preventDefault();
              if (exitTarget === "reset") returnToGlobal();
              else enterSubmapContent(exitTarget);
              return;
            }
          }
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
        body.setAttribute("role", "rowgroup");
        const typing = document.createElement("div");
        typing.setAttribute("role", "presentation");
        for (const row of rows) {
          const element = document.createElement("div");
          element.className = "key-row";
          element.setAttribute("role", "row");
          row.forEach((definition) => element.append(makeKey(definition)));
          typing.append(element);
        }
        const nav = document.createElement("div");
        nav.className = "nav-area";
        nav.setAttribute("role", "presentation");
        for (const row of navRows) {
          const element = document.createElement("div");
          element.className = "nav-row";
          element.setAttribute("role", "row");
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
          button.dataset.bindingId = String(binding.id);
          button.classList.toggle("has-duplicate", duplicates(binding.key));
          button.innerHTML = `<span class="extra-key-label"></span><span class="extra-key-code"></span>`;
          button.querySelector(".extra-key-label").textContent = binding.short;
          button.querySelector(".extra-key-code").textContent = binding.key.replace("XF86", "");
          button.title = t("keyboard.boundTitle", {
            key: binding.key,
            descriptions: binding.title || t("binding.noDescription"),
          });
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
          button.dataset.bindingId = String(binding.id);
          button.classList.toggle("has-duplicate", duplicates(binding.key));
          const icon = binding.key === "mouse:272" ? "L" : binding.key === "mouse:273" ? "R" : binding.key === "mouse_up" ? "↑" : "↓";
          button.innerHTML = `<span class="mouse-icon">${icon}</span><span class="mouse-copy"><strong></strong><span></span></span>`;
          button.querySelector(".mouse-copy strong").textContent = binding.combo;
          button.querySelector(".mouse-copy span").textContent = binding.short;
          button.title = t("keyboard.boundTitle", {
            key: binding.combo,
            descriptions: binding.title || t("binding.noDescription"),
          });
          button.addEventListener("click", () => select(binding.key));
          document.querySelector("#mouse-keys").append(button);
          allButtons.push(button);
        }
      }

      function localizedDiagnostic(issue) {
        const params = { ...(issue.params || {}) };
        if (params.context) {
          params.context = displaySubmap(params.context, params.context === "universal");
        }
        if (params.trigger) params.trigger = displayTrigger(params.trigger);
        if (Array.isArray(params.entries)) {
          params.details = params.entries
            .map((entry) => t("diagnostics.lineDescription", {
              source: displaySource(entry.source),
              line: entry.line,
              description: entry.description || t("binding.noDescription"),
            }))
            .join(t("common.semicolon"));
        }
        if (Array.isArray(params.reasons)) {
          params.reasons = params.reasons
            .map((reason) => t(`diagnostics.reason.${reason}`))
            .join(t("common.listSeparator"));
        }
        const variant = params.kind ? `.${params.kind}` : "";
        const titleKey = `diagnostics.${issue.code}.title${variant}`;
        const messageKey = `diagnostics.${issue.code}.message${variant}`;
        return {
          title: lookupTranslation(titleKey) !== null ? t(titleKey, params) : issue.title,
          message: lookupTranslation(messageKey) !== null
            ? t(messageKey, params)
            : issue.message,
        };
      }

      function renderDiagnostics() {
        const root = document.querySelector("#diagnostics-list");
        const errors = data.stats.errors;
        const warnings = data.stats.warnings;
        document.querySelector("#diagnostics-summary").textContent = [
          quantity("diagnostics.errorCount", errors),
          quantity("diagnostics.warningCount", warnings),
          quantity("diagnostics.submapCount", data.submaps.length),
        ].join(" / ");
        root.replaceChildren();
        if (!data.diagnostics.length) {
          const clean = document.createElement("div");
          clean.className = "diagnostics-clean";
          const icon = document.createElement("i");
          icon.textContent = "✓";
          const copy = document.createElement("span");
          copy.textContent = t("diagnostics.clean");
          clean.append(icon, copy);
          root.append(clean);
          return;
        }
        const list = document.createElement("div");
        list.className = "diagnostics-list";
        for (const issue of data.diagnostics) {
          const card = document.createElement("article");
          card.className = `diagnostic is-${issue.severity}`;
          const localized = localizedDiagnostic(issue);
          const title = document.createElement("h3");
          title.className = "diagnostic-title";
          const severity = document.createElement("span");
          severity.className = "severity";
          severity.textContent = t(`diagnostics.severity.${issue.severity}`);
          title.append(severity, document.createTextNode(localized.title));
          const message = document.createElement("p");
          message.textContent = localized.message;
          const meta = document.createElement("div");
          meta.className = "diagnostic-meta";
          const locations = issue.locations?.length
            ? issue.locations
            : issue.lines.map((line) => ({ source: data.source_name, line }));
          locations.forEach(({ source, line }) => {
            const item = document.createElement("span");
            item.textContent = `${source}:${line}`;
            meta.append(item);
          });
          card.append(title, message, meta);
          if (issue.key) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = t("diagnostics.viewKey", { key: issue.key });
            button.addEventListener("click", () => select(issue.key));
            card.append(button);
          }
          list.append(card);
        }
        root.append(list);
      }

      function renderSubmapIndex() {
        const root = document.querySelector("#submap-index");
        root.replaceChildren();
        const head = document.createElement("div");
        head.className = "submap-index-head";
        const heading = document.createElement("span");
        heading.textContent = t("submap.navigation");
        const actions = document.createElement("span");
        actions.className = "submap-head-actions";
        const count = document.createElement("span");
        count.textContent = quantity("submap.count", data.submaps.length);
        actions.append(count);
        head.append(heading, actions);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "submap-toggle";
        toggle.textContent = t(submapsExpanded ? "submap.collapse" : "submap.expand");
        toggle.setAttribute("aria-expanded", String(submapsExpanded));
        toggle.addEventListener("click", () => {
          submapsExpanded = !submapsExpanded;
          list.hidden = !submapsExpanded;
          toggle.textContent = t(submapsExpanded ? "submap.collapse" : "submap.expand");
          toggle.setAttribute("aria-expanded", String(submapsExpanded));
        });
        actions.append(toggle);

        const overview = document.createElement("button");
        overview.type = "button";
        overview.className = "submap-overview-button";
        overview.disabled = data.submaps.length === 0;
        const overviewCopy = document.createElement("div");
        const overviewTitle = document.createElement("strong");
        overviewTitle.textContent = t("submap.overviewTitle");
        const overviewSubtitle = document.createElement("span");
        overviewSubtitle.textContent = t("submap.overviewSubtitle");
        overviewCopy.append(overviewTitle, overviewSubtitle);
        const overviewArrow = document.createElement("b");
        overviewArrow.textContent = "→";
        overview.append(overviewCopy, overviewArrow);
        overview.addEventListener("click", enterSubmapOverview);
        root.append(head, overview);
        if (!data.submaps.length) {
          const empty = document.createElement("div");
          empty.className = "submap-empty";
          empty.textContent = t("submap.empty");
          root.append(empty);
          return;
        }

        const list = document.createElement("div");
        list.className = "submap-list";
        list.hidden = !submapsExpanded;
        data.submaps.forEach((submap) => {
          const entries = submap.entry_binding_ids
            .map((id) => bindingById.get(id))
            .filter(Boolean);
          const card = document.createElement("button");
          card.type = "button";
          card.className = "submap-card";
          card.disabled = submap.binding_ids.length === 0;
          card.setAttribute("aria-label", t("submap.view", { name: submap.name }));
          const name = document.createElement("strong");
          name.textContent = submap.name;
          const summary = document.createElement("span");
          summary.textContent = t("submap.summary", {
            keys: quantity("unit.key", submap.binding_ids.length),
            entries: quantity("unit.entry", entries.length),
          });
          const shortcuts = document.createElement("code");
          shortcuts.textContent = entries.length
            ? entries.map((binding) => binding.combo).join(" / ")
            : t("submap.noEntries");
          const cta = document.createElement("span");
          cta.className = "submap-card-cta";
          cta.textContent = t("submap.cta");
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

      function announceDetail(message) {
        const live = document.querySelector("#detail-live");
        live.textContent = "";
        window.setTimeout(() => {
          live.textContent = message;
        }, 0);
      }

      function bindingCard(binding) {
        const card = document.createElement("article");
        card.className = "binding-card";
        card.classList.toggle("is-duplicate", binding.duplicate_group !== null);
        card.append(combo(binding));

        const scope = document.createElement("div");
        scope.className = "binding-scope";
        [
          [t("binding.submap"), displaySubmap(binding.submap, binding.submap_universal)],
          [t("binding.device"), displayDevice(binding.device_scope)],
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
        flagsLabel.textContent = t("binding.flags");
        const flagList = document.createElement("div");
        flagList.className = "flag-list";
        if (binding.flags.length) {
          binding.flags.forEach((flag) => {
            const item = document.createElement("span");
            item.className = "flag-pill";
            item.append(document.createTextNode(flagLabel(flag)));
            const code = document.createElement("code");
            code.textContent = flag;
            item.append(code);
            flagList.append(item);
          });
        } else {
          const none = document.createElement("span");
          none.className = "flag-pill";
          none.textContent = t("binding.noFlags");
          flagList.append(none);
        }
        flagsSection.append(flagsLabel, flagList);
        const title = document.createElement("h3");
        title.className = "binding-title";
        title.textContent = binding.title || t("binding.noDescription");
        title.classList.toggle("is-missing", !binding.title);
        if (binding.duplicate_group !== null) {
          const badge = document.createElement("span");
          badge.className = "bug-badge";
          badge.textContent = t("binding.duplicate");
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
        meta.children[0].textContent =
          `${binding.source_display || displaySource(binding.source)}:${binding.line}`;
        const sourceLabel = binding.annotation_source === "description"
          ? t("binding.descriptionSource")
          : t("binding.missingDescriptionSource");
        meta.children[1].textContent = binding.enabled
          ? `${t(binding.device === "mouse" ? "binding.mouseBind" : "binding.hyprBind")} · ${sourceLabel}`
          : t("binding.disabled");
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

      function emptyState(strongText, hintText) {
        const empty = document.createElement("div");
        empty.className = "empty";
        const copy = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = strongText;
        copy.append(strong, document.createTextNode(hintText));
        empty.append(copy);
        return empty;
      }

      function renderDetail() {
        const list = document.querySelector("#binding-list");
        if (viewMode === "search" && selectedTarget === null) {
          list.removeAttribute("role");
          list.removeAttribute("aria-label");
          document.querySelector("#selected-cap").textContent = "⌕";
          document.querySelector("#current-selection").textContent = "—";
          document.querySelector("#detail-title").textContent = t("detail.searchTitle");
          document.querySelector("#detail-count").textContent =
            quantity("unit.bind", searchResults.length);
          document.querySelector("#detail-eyebrow").textContent = t("detail.searchEyebrow");
          document.querySelector("#detail-subtitle").textContent = searchQuery
            ? t("detail.searchSubtitle", { query: searchQuery })
            : t("detail.filterSubtitle");
          announceDetail(quantity("live.search", searchResults.length));
          list.replaceChildren();
          list.append(emptyState(
            t(searchResults.length ? "detail.searchEmptyStrong" : "detail.searchEmptyNoneStrong"),
            t("search.choiceHint"),
          ));
          updateStyles();
          updateKeyboardHighlights();
          updateModeBar();
          return;
        }
        list.removeAttribute("role");
        list.removeAttribute("aria-label");
        if (selectedTarget === null) {
          const overview = viewMode === "overview";
          document.querySelector("#selected-cap").textContent = overview ? "Σ" : "↓";
          document.querySelector("#current-selection").textContent = "—";
          document.querySelector("#detail-title").textContent = overview
            ? t("detail.overviewTitle")
            : activeSubmap;
          document.querySelector("#detail-count").textContent = overview
            ? quantity("submap.count", data.submaps.length)
            : quantity("unit.bind", 0);
          document.querySelector("#detail-eyebrow").textContent =
            t(overview ? "detail.overviewEyebrow" : "detail.submapEyebrow");
          document.querySelector("#detail-subtitle").textContent = overview
            ? t("detail.overviewSubtitle")
            : t("detail.emptySubmap", { name: activeSubmap });
          announceDetail(
            overview
              ? quantity("live.overview", data.submaps.length)
              : t("live.submapEmpty", { name: activeSubmap }),
          );
          list.replaceChildren();
          list.append(overview
            ? emptyState(t("detail.overviewEmptyStrong"), t("detail.overviewEmptyHint"))
            : emptyState(
              t("detail.emptySubmapStrong", { name: activeSubmap }),
              t("detail.emptySubmapHint"),
            ));
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
        document.querySelector("#detail-count").textContent =
          quantity("unit.bind", found.length);
        document.querySelector("#detail-eyebrow").textContent =
          t(modifier ? "detail.modifierEyebrow" : "detail.keyEyebrow");
        document.querySelector("#detail-subtitle").textContent = modifier
          ? t("detail.modifierFilter", { name: title })
          : found.length
            ? quantity("detail.keyCombos", found.length)
            : viewMode === "submap"
              ? t("detail.noBindingInSubmap", { name: activeSubmap })
              : t("detail.noBinding");
        announceDetail(
          found.length
            ? quantity("live.key", found.length, { key: title })
            : t("live.unbound", { key: title }),
        );
        list.replaceChildren();
        if (!found.length) {
          list.append(viewMode === "submap"
            ? emptyState(
              t("detail.notInSubmap", { key: title, name: activeSubmap }),
              t("detail.notInSubmapHint"),
            )
            : emptyState(
              t("detail.unbound", { key: title }),
              t("detail.unboundHint"),
            ));
        } else {
          found.forEach((binding) => list.append(bindingCard(binding)));
        }
        updateStyles();
        updateKeyboardHighlights();
        updateModeBar();
      }

      function select(target) {
        if (viewMode === "search") {
          closeSearchPopover();
        }
        selectedTarget = target;
        renderDetail();
        syncUrl(false);
        if (window.matchMedia("(max-width: 960px)").matches) {
          document.querySelector(".detail").scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      function renderStats() {
        document.querySelector("#source-path").textContent = data.source_path;
        document.querySelector("#generated-at").textContent = data.generated_at;
        document.querySelector("#case-label").textContent = t("case.label", {
          bindings: quantity("unit.bind", data.stats.bindings),
        });
        document.querySelector("#stat-bindings").textContent = data.stats.bindings;
        document.querySelector("#stat-keys").textContent = data.stats.keys;
        document.querySelector("#stat-duplicates").textContent = data.stats.duplicate_groups;
        document.querySelector("#stat-warnings").textContent = data.stats.warnings;
        updateSearchCount();
        document.querySelector("#stat-duplicate-wrap").classList.toggle("is-bad", data.stats.duplicate_groups > 0);
        document.querySelector("#stat-duplicate-wrap").classList.toggle("is-good", data.stats.duplicate_groups === 0);
      }

      function updateKeyboardOverflowHint() {
        const scroller = document.querySelector(".keyboard-scroll");
        document.querySelector("#keyboard-overflow-hint").hidden =
          scroller.scrollWidth <= scroller.clientWidth + 1;
      }

      function syncDiagnosticsState() {
        const panel = document.querySelector("#diagnostics-panel");
        document.querySelector("#diagnostics-state").textContent =
          t(panel.open ? "diagnostics.close" : "diagnostics.open");
      }

      function applyStaticLocale() {
        document.documentElement.lang = locale;
        document.title = t("page.title");
        document.querySelectorAll("[data-i18n]").forEach((element) => {
          element.textContent = t(element.dataset.i18n);
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
          element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
        });
        document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
          element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
        });
        document.querySelectorAll(".language-switch [data-lang]").forEach((button) => {
          const active = button.dataset.lang === locale;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        syncDiagnosticsState();
      }

      function updateAuxiliaryLabels() {
        document.querySelectorAll("[data-binding-id]").forEach((button) => {
          const binding = bindingById.get(Number(button.dataset.bindingId));
          if (!binding) return;
          button.title = t("keyboard.boundTitle", {
            key: button.classList.contains("mouse-key") ? binding.combo : binding.key,
            descriptions: binding.title || t("binding.noDescription"),
          });
        });
      }

      function refreshLocalizedSections() {
        applyStaticLocale();
        renderStats();
        updateAuxiliaryLabels();
        renderDiagnostics();
        renderSubmapIndex();
        updateSearchFilterButtons();
        renderDetail();
        if (searchOpen) renderSearchPopover();
      }

      function applyLocale(nextLocale) {
        if (!SUPPORTED_LANGUAGES.includes(nextLocale)) return;
        locale = nextLocale;
        storeLanguage(locale);
        refreshLocalizedSections();
        syncUrl(false);
      }

      applyStaticLocale();
      renderStats();
      renderKeyboard();
      updateKeyboardOverflowHint();
      window.addEventListener("resize", updateKeyboardOverflowHint);
      renderExtraKeys();
      renderMouseKeys();
      renderDiagnostics();
      renderSubmapIndex();
      document.querySelectorAll(".language-switch [data-lang]").forEach((button) => {
        button.addEventListener("click", () => applyLocale(button.dataset.lang));
      });
      document.querySelector("#diagnostics-panel").addEventListener("toggle", syncDiagnosticsState);
      document.querySelector("#keyboard-filter-back").addEventListener("click", returnToGlobal);
      const searchInput = document.querySelector("#bind-search");
      searchInput.addEventListener("input", (event) => applySearch(event.target.value));
      searchInput.addEventListener("focus", () => {
        if (searchQuery || searchFilter !== "all") openSearchPopover();
      });
      searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          applySearch("");
          searchInput.blur();
        } else if (event.key === "ArrowDown" && searchResults.length) {
          event.preventDefault();
          if (!searchOpen) {
            openSearchPopover();
            setActiveSearchResult(0);
            return;
          }
          if (selectedTarget !== null) {
            selectedTarget = null;
            renderDetail();
          }
          setActiveSearchResult(activeSearchResult + 1);
        } else if (event.key === "ArrowUp" && searchResults.length) {
          event.preventDefault();
          if (!searchOpen) {
            openSearchPopover();
            setActiveSearchResult(searchResults.length - 1);
            return;
          }
          if (selectedTarget !== null) {
            selectedTarget = null;
            renderDetail();
          }
          setActiveSearchResult(activeSearchResult - 1);
        } else if (event.key === "Enter" && searchResults.length) {
          event.preventDefault();
          commitSearchResult(searchResults[activeSearchResult]);
        }
      });
      document.querySelector("#search-clear").addEventListener("click", () => {
        applySearch("");
        searchInput.focus();
      });
      document.querySelector("#search-popover-close").addEventListener("click", () => {
        closeSearchPopover();
        searchInput.focus();
      });
      document.querySelectorAll(".search-filter").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.disabled) return;
          searchFilter = button.dataset.filter;
          updateSearchFilterButtons();
          applySearch(searchInput.value);
          searchInput.focus();
        });
      });
      document.addEventListener("keydown", (event) => {
        const target = event.target;
        const typing = target instanceof HTMLInputElement
          || target instanceof HTMLTextAreaElement
          || target.isContentEditable;
        if (!typing && (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k"))) {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
          if (searchQuery || searchFilter !== "all") openSearchPopover();
        }
      });
      document.addEventListener("click", (event) => {
        if (event.target.closest(".language-switch")) return;
        if (!event.target.closest(".search-area")) closeSearchPopover();
      });
      window.addEventListener("popstate", restoreFromUrl);
      updateSearchFilterButtons();
      renderDetail();
      restoreFromUrl();
    })();
