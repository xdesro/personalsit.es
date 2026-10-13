// @ts-check

const getIsDark = () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  return currentTheme
    ? currentTheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const syncThemeToggle = () => {
  document.querySelector('.theme-toggle').setAttribute(
    'aria-label',
    getIsDark() ? 'Switch to light theme' : 'Switch to dark theme'
  );
};

const toggleTheme = () => {
  const root = document.documentElement;
  const newTheme = getIsDark() ? 'light' : 'dark';
  root.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  syncThemeToggle();
};

syncThemeToggle();

const initTagFilter = () => {
  const filterSection = document.querySelector('.tag-filter');
  if (!filterSection) return;

  const pills = [...filterSection.querySelectorAll('.tag-filter__pill')];
  const items = [...document.querySelectorAll('.item')];

  const validTags = new Set(pills.map((pill) => pill.dataset.tag));

  const selected = new Set(
    new URLSearchParams(window.location.search)
      .get('tags')
      ?.split(',')
      .map((tag) => tag.trim())
      .filter((tag) => validTags.has(tag)) ?? []
  );

  const applyFilter = () => {
    items.forEach((item) => {
      const itemTags = new Set((item.dataset.tags || '').split(','));
      const isVisible =
        selected.size === 0 ||
        [...selected].some((tag) => itemTags.has(tag));
      item.hidden = !isVisible;
    });
    pills.forEach((pill) => {
      const isActive = selected.has(pill.dataset.tag);
      pill.setAttribute('aria-pressed', String(isActive));
    });
    const url = new URL(window.location.href);
    if (selected.size > 0) {
      url.searchParams.set('tags', [...selected].sort().join(','));
    } else {
      url.searchParams.delete('tags');
    }
    window.history.replaceState(null, '', url);
  };

  pills.forEach((pill) =>
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      if (selected.has(tag)) {
        selected.delete(tag);
      } else {
        selected.add(tag);
      }
      applyFilter();
    })
  );

  applyFilter();
};

document.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
initTagFilter();

console.log(` ▄▄▄       ▄████▄   ▄▄▄       ▄▄▄▄   
▒████▄    ▒██▀ ▀█  ▒████▄    ▓█████▄ 
▒██  ▀█▄  ▒▓█    ▄ ▒██  ▀█▄  ▒██▒ ▄██
░██▄▄▄▄██ ▒▓▓▄ ▄██▒░██▄▄▄▄██ ▒██░█▀  
 ▓█   ▓██▒▒ ▓███▀ ░ ▓█   ▓██▒░▓█  ▀█▓
 ▒▒   ▓▒█░░ ░▒ ▒  ░ ▒▒   ▓▒█░░▒▓███▀▒
  ▒   ▒▒ ░  ░  ▒     ▒   ▒▒ ░▒░▒   ░ 
  ░   ▒   ░          ░   ▒    ░    ░ 
      ░  ░░ ░            ░  ░ ░      
          ░                        ░ `);
