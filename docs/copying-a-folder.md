# Copying a folder

This short guide explains how to copy a specific folder to a differently named
one in the same directory.

The first step is to create a normal backup of your data, for example:

    rs-backup -u tony@5apps.com -c chat-messages -o tony-5apps

Now, simply rename the local folder in your backup, for example:

    mv tony-5apps/chat-messages/5apps tony-5apps/chat-messages/muc.5apps.com

You also need to update the item list of the parent folder to reflect the name
change. Open e.g. `tony-5apps/chat-messages/000_folder-description.json` and
change the folder name in the "items" map, for example:

```patch
{
  "@context": "http://remotestorage.io/spec/folder-description",
  "items": {
-   "5apps/": {
+   "muc.5apps.com/": {
      "ETag": "42c87eae6703f43d68541bf1111e4c53"
    }
  }
}
```

Now we can restore the category, which will add the renamed folder as a new
folder to your storage, while still preserving the old one:

    rs-restore -u tony@5apps.com -c chat-messages -i tony-5apps

That's it. Your new folder and its contents should now be available in your
remote storage.

---

Note, in case you want to rename a folder (i.e. copying it and deleting the
original): There is currently no functionality for deleting the original
folder, so if you want to remove it, then you will have to use a different app
for now. [Inspektor](https://inspektor.5apps.com/) lets you delete all
documents within a folder for example.
