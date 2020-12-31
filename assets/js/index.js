// @ts-check

const toggleTheme = (e) => {
  document.documentElement.toggleAttribute('dark');
};
const toggleActiveTray = (e) => {
  const items = [...document.querySelectorAll('.item')];
  const parentContainer = e.target.closest('.items');
  const parentItem = e.target.closest('.item');
  const containerStyle = window.getComputedStyle(parentContainer);
  const isActive = parentItem.classList.contains('item--active');
  const tray = parentItem.querySelector('.item-tray');

  items.forEach((item) => item.classList.remove('item--active'));
  isActive
    ? parentItem.classList.remove('item--active')
    : parentItem.classList.add('item--active');
  tray.style.width = `calc(${containerStyle.width} - (2 * ${containerStyle.paddingLeft}))`;
};

const lazyLoader = new IntersectionObserver((entries, observer) => {
  entries.forEach(({ isIntersecting, target: image }) => {
    if (isIntersecting) {
      image.src = image.dataset.src;
      lazyLoader.unobserve(image);
    }
  });
});
const headerToggle = new IntersectionObserver((entries) => {
  entries.forEach(({ isIntersecting }) => {
    const fixedNav = document.querySelector('.fixed-nav');
    if (!isIntersecting) {
      fixedNav.classList.add('fixed-nav--active');
    } else {
      fixedNav.classList.remove('fixed-nav--active');
    }
  });
});
headerToggle.observe(document.querySelector('.site-head'));

document.addEventListener('DOMContentLoaded', () => {
  [
    ...document.querySelectorAll('.item__image, .item-tray__image'),
  ].forEach((img) => lazyLoader.observe(img));
});
document.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
[...document.querySelectorAll('.item__toggle')].forEach((button) =>
  button.addEventListener('click', toggleActiveTray)
);

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
