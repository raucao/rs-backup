# remoteStorage Backup/Restore

This program allows you to backup your data from a remoteStorage account to a
local hard drive and restore it to the same or another account or server.

## Install

You'll need node.js `>=5.0.0` on your computer. (You're welcome to test with
older versions and tell me if it works.)

    npm install -g rs-backup

## Usage

    rs-backup --help
    rs-restore --help

You'll need a valid token for either the whole storage or the category you're
backing up. You can either get one from your server or e.g. look it up in the
localStorage of a connected app (try [rs-browser][1] for a root token).

If you don't know what any of that means, please check back here in a few
weeks, so you don't have to dig into RS technicalities. Thanks!

[1] https://remotestorage-browser.5apps.com
