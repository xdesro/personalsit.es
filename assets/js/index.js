// @ts-check
document.addEventListener('DOMContentLoaded', () => {
  const lazyLoader = new IntersectionObserver((entries, observer) => {
    entries.forEach(({ isIntersecting, target: image }) => {
      if (isIntersecting) {
        image.src = image.dataset.src;
        lazyLoader.unobserve(image);
      }
    });
  });

  const images = [...document.querySelectorAll('.item__image')];
  images.forEach((img) => lazyLoader.observe(img));
});
