# remoteStorage Backup/Restore

This program allows you to backup your data from a [remoteStorage][1] account
to a local hard drive and restore it to the same or another account or server.

## Install

You'll need node.js `>=5.0.0` on your computer. (You're welcome to test with
older versions and tell me if it works.)

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
