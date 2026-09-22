# 💻 PersonalSit.es

Personal sites are rad, so this project was built so we can all discover each other's, gain inspiration, and rally around the cause of the mighty personal site!

## 📇 Adding your own site

Want to add your site? We'd love your contribution. Go ahead and follow these steps, and [reach out](https://bsky.app/profile/strange.website) if you have any trouble with this!

1. 🍴 Fork this repository.

2. 📝 Add a new `.yaml` file in `sites` that is `{yourDomain}.yaml`.

   > For example: `sites/bell.bz.yaml`.

3. 🖋 Fill out the details. Here's the template:

   ```yaml
   title: "Andy Bell"
   url: "https://bell.bz"
   tags: ["developer", "writer"]
   feed: "https://bell.bz/feed.xml"
   ```

The required fields are `title`, `url`, and `tags`. `feed` is optional and points to your site's RSS/Atom feed. Tags must come from the list in [`sites.schema.json`](sites.schema.json).

4. 🖥 Create a pull request, and after your site has been approved by an admin, it'll appear on [personalsit.es](https://personalsit.es)!

> [!NOTE]
> I don't really fw LLMs, and I close glaringly AI-generated PRs. No hard feelings, it's just a repo about personal websites!

## 🖼️ Updating your site's screenshot

Right now, this is a fairly manual process. Feel free to [open an issue](https://github.com/xdesro/personalsit.es/issues/new) with a request to update your screenshot and we'll be happy to sort that out!

## 📄 Contributions

Got an idea for an enhancement? Awesome — don't be shy about [creating an issue](https://github.com/xdesro/personalsit.es/issues/new), or even [opening a pull request](https://github.com/xdesro/personalsit.es/pulls), if you're feeling ambitious. I'd welcome the assist!

## 🗣 Colophon

This project was originally created by the GOAT [Andy Bell](https://bell.bz) and is lately maintained by [Henry Desroches](https://henry.codes) and [Declan Chidlow](https://vale.rocks).
