# 💻 PersonalSit.es

Personal sites are rad, so this project was built so we can all discover each other's, gain inspiration, and rally around the cause of the mighty personal site!

## 📇 Adding your own site

Want to add your site? We'd love your contribution. The easiest way is to use the [site submission form](https://github.com/xdesro/personalsit.es/issues/new?template=submit-site.yml). Fill in your site details and a maintainer will review it. You'll need a GitHub account, but you don't need to fork the repository or know Git.

After you fill out the form:

1. 📝 A GitHub issue with your site details is generated.
2. 🤖 An automation checks the submission is valid and not a duplicate. If anything is awry, it leaves a comment letting you know.
3. 👀 A maintainer reviews the issue and applies the `approved` label.
4. 🖥 A pull request is opened automatically. Once merged, your site appears on [personalsit.es](https://personalsit.es)!

If you prefer the manual route you can author your own pull request:

1. 🍴 Fork this repository.

2. 📝 Add a new `.yaml` file in the `/sites` directory titled `{yourDomain}.yaml`. For example, `sites/bell.bz.yaml`.

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

Use the [screenshot update form](https://github.com/xdesro/personalsit.es/issues/new?template=update-screenshot.yml) to request a fresh screenshot. A maintainer will review the request, and once it's approved the screenshot is captured and uploaded automatically.

## 🗑️ Removing your site

Use the [site removal form](https://github.com/xdesro/personalsit.es/issues/new?template=remove-site.yml) to request removal. A maintainer will review the request, and once it's approved a pull request removing the site entry will be opened.

## 📄 Contributions

Got an idea for an enhancement? Awesome — don't be shy about [creating an issue](https://github.com/xdesro/personalsit.es/issues/new), or even [opening a pull request](https://github.com/xdesro/personalsit.es/pulls), if you're feeling ambitious. I'd welcome the assist!

## 🗣 Colophon

This project was originally created by the GOAT [Andy Bell](https://bell.bz) and is lately maintained by [Henry Desroches](https://henry.codes) and [Declan Chidlow](https://vale.rocks).
