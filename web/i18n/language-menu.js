// Styled language picker (select-only combobox pattern) layered over the native
// <select>. The select stays the single source of truth: choosing a language sets
// its value and dispatches "change", which translate-page.js already handles.

function starPoints(cx, cy, outer, inner, points, rotation = -90) {
  const coordinates = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = ((rotation + (i * 180) / points) * Math.PI) / 180;
    coordinates.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return coordinates.join(" ");
}

let flagCount = 0;

// Vector flags in the regions the existing emoji used. Each call returns fresh
// markup so clip-path ids stay unique when a flag appears twice.
const flags = {
  en() {
    const id = `jm-flag-gb-${(flagCount += 1)}`;
    return `<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="${id}-s"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="${id}-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#${id}-s)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#${id}-t)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>`;
  },
  de: () => '<svg viewBox="0 0 5 3" preserveAspectRatio="none"><path fill="#000" d="M0 0h5v1H0z"/><path fill="#D00" d="M0 1h5v1H0z"/><path fill="#FFCE00" d="M0 2h5v1H0z"/></svg>',
  es: () => '<svg viewBox="0 0 3 2" preserveAspectRatio="none"><path fill="#AA151B" d="M0 0h3v2H0z"/><path fill="#F1BF00" d="M0 .5h3v1H0z"/></svg>',
  fr: () => '<svg viewBox="0 0 3 2" preserveAspectRatio="none"><path fill="#002395" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#ED2939" d="M2 0h1v2H2z"/></svg>',
  vi: () => `<svg viewBox="0 0 30 20"><path fill="#DA251D" d="M0 0h30v20H0z"/><polygon fill="#FF0" points="${starPoints(15, 10, 6, 2.3, 5)}"/></svg>`,
  "zh-Hans": () => `<svg viewBox="0 0 30 20"><path fill="#EE1C25" d="M0 0h30v20H0z"/><g fill="#FF0"><polygon points="${starPoints(5, 5, 3, 1.15, 5)}"/><polygon points="${starPoints(10, 2, 1, .38, 5, -54)}"/><polygon points="${starPoints(12, 4, 1, .38, 5, -72)}"/><polygon points="${starPoints(12, 7, 1, .38, 5, -108)}"/><polygon points="${starPoints(10, 9, 1, .38, 5, -126)}"/></g></svg>`,
  "zh-Hant": () => `<svg viewBox="0 0 30 20"><path fill="#FE0000" d="M0 0h30v20H0z"/><path fill="#000095" d="M0 0h15v10H0z"/><polygon fill="#fff" points="${starPoints(7.5, 5, 3.75, 2.15, 12)}"/><circle cx="7.5" cy="5" r="2.1" fill="#000095"/><circle cx="7.5" cy="5" r="1.75" fill="#fff"/></svg>`,
};

const checkIcon = '<svg class="jm-lang-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function flag(code) {
  return `<span class="jm-lang-flag" aria-hidden="true">${flags[code]?.() ?? ""}</span>`;
}

export function enhanceLanguageMenu(selector) {
  const container = selector.closest(".jm-language");
  const label = container.querySelector(`label[for="${selector.id}"]`);
  if (label && !label.id) label.id = `${selector.id}-label`;
  const languages = [...selector.options].map((option) => ({
    value: option.value,
    lang: option.lang,
    // Names come from the existing options; only the emoji flag is dropped.
    name: option.textContent.replace(/^\p{Regional_Indicator}{2}\s*/u, "").trim(),
  }));

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jm-lang-button";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", `${selector.id}-list`);
  button.setAttribute("aria-labelledby", `${label?.id ?? ""} ${selector.id}-current`.trim());

  const list = document.createElement("ul");
  list.className = "jm-lang-list";
  list.id = `${selector.id}-list`;
  list.setAttribute("role", "listbox");
  if (label) list.setAttribute("aria-labelledby", label.id);
  list.tabIndex = -1;
  list.hidden = true;
  list.innerHTML = languages.map((language) =>
    `<li class="jm-lang-option" role="option" id="${selector.id}-option-${language.value}" data-value="${language.value}" lang="${language.lang}" aria-selected="false">${flag(language.value)}<span class="jm-lang-name">${language.name}</span>${checkIcon}</li>`).join("");
  const options = [...list.children];

  selector.hidden = true;
  container.append(button, list);

  let active = 0;

  function selectedIndex() {
    return Math.max(0, languages.findIndex((language) => language.value === selector.value));
  }

  function setActive(index) {
    active = (index + options.length) % options.length;
    options.forEach((option, i) => option.classList.toggle("is-active", i === active));
    button.setAttribute("aria-activedescendant", options[active].id);
  }

  function open(index = selectedIndex()) {
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    setActive(index);
  }

  function close() {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    options.forEach((option) => option.classList.remove("is-active"));
  }

  function choose(index) {
    const { value } = languages[index];
    close();
    button.focus();
    if (value === selector.value) return;
    selector.value = value;
    selector.dispatchEvent(new Event("change"));
  }

  function sync() {
    const current = languages[selectedIndex()];
    button.innerHTML = `${flag(current.value)}<span class="jm-lang-name" id="${selector.id}-current" lang="${current.lang}">${current.name}</span>`;
    options.forEach((option) => option.setAttribute("aria-selected", String(option.dataset.value === current.value)));
  }

  button.addEventListener("click", () => (list.hidden ? open() : close()));
  button.addEventListener("keydown", (event) => {
    const expanded = !list.hidden;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!expanded) open(); else setActive(active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!expanded) open(); else setActive(active - 1);
        break;
      case "Home":
        if (expanded) { event.preventDefault(); setActive(0); }
        break;
      case "End":
        if (expanded) { event.preventDefault(); setActive(options.length - 1); }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (expanded) choose(active); else open();
        break;
      case "Escape":
        if (expanded) { event.preventDefault(); close(); }
        break;
      case "Tab":
        if (expanded) close();
        break;
      default:
        // Type-ahead to the next language whose name starts with the typed character.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const key = event.key.toLocaleLowerCase();
          for (let step = 1; step <= options.length; step += 1) {
            const index = ((expanded ? active : selectedIndex()) + step) % options.length;
            if (languages[index].name.toLocaleLowerCase().startsWith(key)) {
              if (expanded) setActive(index); else open(index);
              break;
            }
          }
        }
    }
  });

  // Keep focus on the combobox while the pointer interacts with the list.
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const option = event.target.closest(".jm-lang-option");
    if (option) choose(options.indexOf(option));
  });
  list.addEventListener("mousemove", (event) => {
    const option = event.target.closest(".jm-lang-option");
    if (option && options.indexOf(option) !== active) setActive(options.indexOf(option));
  });
  document.addEventListener("click", (event) => {
    if (!list.hidden && !container.contains(event.target)) close();
  });
  button.addEventListener("blur", () => {
    if (!list.hidden) close();
  });

  return { sync };
}
