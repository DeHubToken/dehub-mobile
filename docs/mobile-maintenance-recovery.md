# Mobile recovery, October 16

The production API recovered and both categories and feed returned HTTP 200.
iOS and Android continue using `https://dehub.io/maintenance.json` on launch,
foreground and Try again. The web Worker now controls that native status with
`MOBILE_MAINTENANCE_MODE`, independently of its web page maintenance setting.

With mobile set to false and web set to true, installed apps can resume their
normal API flow while the website stays on its maintenance page. Publish the
current main bundle to both iOS and Android on production and preview through
the manual mobile update workflow. No native runtime change is required.
