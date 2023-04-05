[![npm](https://img.shields.io/npm/v/rs-backup.svg)](https://www.npmjs.com/package/rs-backup)

# remoteStorage Backup/Restore

This program allows you to backup your data from a [remoteStorage][1] account
to a local hard drive, and restore it either to the same account, or another
account or server.

## Install

With [node.js][2] and npm installed on your computer:

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
[2]: https://nodejs.org
