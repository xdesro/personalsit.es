export default async (req) => {
  try {
    const { origin } = new URL(req.url);

    // Loads up the all feed, regardless of local, deploy preview or live
    const itemsRequest = await fetch(`${origin}/feed/all.json`);
    const { items } = await itemsRequest.json();

    // Grab a random item
    const redirect = items[Math.floor(Math.random() * items.length)];

    if (!redirect) throw new Error("No item found");

    return Response.redirect(redirect, 302);
  } catch {
    // If it all goes wrong, redirect to personalsit.es
    return Response.redirect("https://personalsit.es/", 302);
  }
};
