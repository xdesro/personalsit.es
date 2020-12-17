// @ts-check

const toggleActiveTray = (e) => {
  const items = [...document.querySelectorAll('.item')];
  const parentContainer = e.target.closest('.items');
  const parentItem = e.target.closest('.item');
  const isActive = parentItem.classList.contains('item--active');
  const tray = parentItem.querySelector('.item-tray');

  items.forEach((item) => item.classList.remove('item--active'));
  isActive
    ? parentItem.classList.remove('item--active')
    : parentItem.classList.add('item--active');
  // parentItem.style.marginBottom = window.getComputedStyle(tray).height;
  // parentItem.style.marginBottom = `100%`;
  const containerStyle = window.getComputedStyle(parentContainer);

  // tray.style.top = `${parentItem.getBoundingClientRect().bottom}px`;

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

document.addEventListener('DOMContentLoaded', () => {
  [
    ...document.querySelectorAll('.item__image, .item-tray__image'),
  ].forEach((img) => lazyLoader.observe(img));
});

[...document.querySelectorAll('.item__toggle')].forEach((button) =>
  button.addEventListener('click', toggleActiveTray)
);
