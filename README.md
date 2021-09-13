# remoteStorage Backup/Restore

This program allows you to backup your data from a [remoteStorage][1] account
to a local hard drive and restore it to the same or another account or server.

## Install

You'll need node.js on your computer. (The program requires at least the
current LTS version, but likely works with newer versions.)

    npm install -g rs-backup

## Usage

    rs-backup -o path_to_backup_dir
    rs-restore -i path_to_backup_dir

Note that the backup directory will be emptied first, in order to prevent data
inconsistencies that would break your apps. Thus, if you want to preserve older
versions of your data, back them up to different directories (e.g. incl. the
backup date).

You can optionally pass a user address and an authorization token via CLI
arguments, for example when setting up a regular backup job. See `rs-backup
--help` for info.

[1]: https://remotestorage.io
