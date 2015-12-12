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

For now you'll need to provide the base URL of your storage account(s). I'll
add discovery via WebFinger soon, though. If you don't know what any of that
means, please check back here in a few weeks, so you don't have to dig into RS
technicalities. Thanks!
