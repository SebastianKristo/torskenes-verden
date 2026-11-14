# Vedlegg B – web/PWA: rålister

Generert av skriptene i `audit/B-web-skript/` (2026-11-14) mot mock-serveren (port 4921).

## V1. Per CSS-fil (Chromium CSSOM-parse)
```
## per fil
fil|KB|regler|dekl|!important|hex(raw)|unike hex|custom props def
css/ai-control.css|17.9|218|2306|3/3|6|3|1
css/app.css|83.1|990|10456|19/12|386|104|84
css/backup.css|5.0|46|494|1/1|21|15|8
css/birthdays.css|12.8|154|1827|1/1|51|18|18
css/chat.css|16.9|182|2685|12/12|43|23|32
css/chat70.css|7.4|80|1038|1/1|11|10|5
css/claude-import43.css|6.1|73|868|0/0|15|9|7
css/cv.css|2.2|37|283|0/0|22|8|0
css/family.css|24.0|270|3223|48/6|61|25|33
css/family50.css|32.2|293|4084|20/8|68|35|44
css/glimt-figs.css|2.6|8|88|22/2|1|1|0
css/kal39.css|23.1|255|3490|1/1|38|27|49
css/kalender.css|21.4|242|2976|24/3|47|19|25
css/login.css|11.4|116|1421|25/5|28|17|9
css/mat.css|21.2|206|2312|31/7|61|33|61
css/media-musikk.css|8.6|98|1206|0/0|5|5|13
css/media-nrk.css|18.6|205|2282|0/0|10|4|10
css/media.css|3.3|34|331|0/0|14|9|0
css/media43.css|20.4|277|3038|1/1|34|20|23
css/media50.css|2.8|34|320|0/0|9|6|0
css/media70.css|27.0|342|3803|8/6|87|72|84
css/news.css|19.6|192|2928|6/3|27|20|21
css/news73.css|7.9|66|1132|0/0|2|2|0
css/paper.css|56.0|577|6969|238/35|156|44|71
css/receipts48.css|7.9|86|923|4/1|12|5|13
css/receipts51.css|2.6|19|198|0/0|6|4|0
css/skjold76.css|19.3|213|2731|17/3|41|30|37
css/skjold77.css|9.9|108|1360|1/1|6|1|0
css/skjold78.css|7.3|84|936|0/0|15|4|0
css/skjold79.css|7.6|80|986|0/0|4|2|0
css/skjold82.css|4.7|50|529|0/0|0|0|0
css/smb-wizard.css|10.1|112|1284|12/6|12|10|12
css/space.css|8.8|95|1248|1/1|39|11|9
css/tasks.css|17.7|199|2572|37/6|40|19|20
css/tracking.css|14.4|171|1581|0/0|48|18|0
css/weather.css|24.4|294|3043|0/0|96|31|1
css/web30.css|19.3|198|2675|16/10|67|29|24
css/web31.css|13.4|124|1331|8/3|43|19|2
css/web32.css|10.4|95|1160|8/5|42|26|22
css/web34.css|1.6|12|117|0/0|4|4|0
css/web35.css|21.0|219|3209|1/1|120|35|30
css/web36.css|27.8|241|3376|40/15|115|28|2
css/web37.css|8.5|84|1169|2/2|68|26|0
css/web38.css|28.4|257|3401|72/14|84|27|24
css/web39.css|20.2|219|2765|0/0|50|33|14
css/web40.css|31.8|249|2973|208/41|204|68|166
css/web41.css|26.8|282|3867|66/10|110|43|9
css/web42.css|8.0|95|1039|0/0|34|13|0
css/web43.css|10.9|111|1393|0/0|36|21|13
css/web44-dark.css|42.8|453|3022|12/4|672|24|179
css/web44.css|58.0|622|9413|8/8|199|64|52
css/web45.css|23.4|224|2923|67/14|121|45|42
css/web46.css|26.7|243|3530|39/5|96|42|29
css/web52.css|14.8|145|1928|29/7|87|30|30
css/web65.css|27.5|189|2412|22/8|66|38|58
css/web66-sys.css|7.9|66|617|4/1|37|31|32
css/web73-brief.css|2.4|24|331|0/0|17|8|0
css/web88-dark.css|3.7|20|219|0/0|6|5|9
finans/css/fin42.css|40.4|442|5446|7/7|181|82|75
finans/css/fin52.css|12.5|110|1165|22/7|24|12|0
finans/css/finans.css|69.9|754|8974|19/11|259|111|247
finans/css/finn.css|30.5|366|3840|3/3|101|40|2
finans/css/logo73.css|8.5|68|1097|0/0|57|12|0
finans/css/mobile.css|751.8|7535|99541|4601/914|1888|361|353
finans/css/plan51.css|10.9|142|1324|3/3|4|3|1
TOTAL {"bytes":1992230,"rules":20095,"decl":251208,"imp":5790}
```

## V2. Variabelsett (prefiks)
```
## variabelsett (prefiks: antall navn, definisjoner, filer)
--mp*: 47 navn, 175 def, 3 filer (css/mat.css,css/web44-dark.css,finans/css/mobile.css)
--f*: 42 navn, 144 def, 6 filer (css/app.css,css/family.css,css/family50.css,css/paper.css,css/web40.css,css/web44-dark.css)
--b*: 40 navn, 106 def, 7 filer (css/birthdays.css,css/claude-import43.css,css/media43.css,css/media70.css,css/web43.css,css/web44-dark.css…)
--p*: 39 navn, 78 def, 2 filer (css/media70.css,css/web88-dark.css)
--x*: 22 navn, 56 def, 1 filer (finans/css/mobile.css)
--c44*: 21 navn, 42 def, 1 filer (css/web44.css)
--s*: 20 navn, 37 def, 1 filer (css/skjold76.css)
--k*: 16 navn, 122 def, 12 filer (css/claude-import43.css,css/kal39.css,css/kalender.css,css/media43.css,css/media70.css,css/web38.css…)
--s65*: 15 navn, 57 def, 1 filer (css/web65.css)
--g*: 14 navn, 21 def, 2 filer (css/login.css,finans/css/mobile.css)
--w*: 12 navn, 12 def, 1 filer (css/smb-wizard.css)
--r*: 11 navn, 17 def, 5 filer (css/ai-control.css,css/app.css,css/paper.css,css/space.css,finans/css/finans.css)
--pp*: 10 navn, 83 def, 4 filer (css/paper.css,css/web40.css,css/web44-dark.css,finans/css/mobile.css)
--t*: 10 navn, 30 def, 3 filer (css/tasks.css,css/web44-dark.css,css/web44.css)
--w30*: 10 navn, 30 def, 3 filer (css/web30.css,css/web44-dark.css,css/web44.css)
--dm*: 10 navn, 24 def, 2 filer (css/web32.css,css/web44-dark.css)
--gs*: 10 navn, 33 def, 2 filer (css/web35.css,css/web44-dark.css)
--c*: 9 navn, 19 def, 4 filer (css/media-musikk.css,css/media-nrk.css,css/web45.css,finans/css/finans.css)
--a*: 9 navn, 25 def, 1 filer (finans/css/mobile.css)
--pos*: 7 navn, 30 def, 6 filer (css/family.css,css/paper.css,css/web40.css,css/web44-dark.css,css/web44.css,finans/css/finans.css)
--r48*: 7 navn, 13 def, 1 filer (css/receipts48.css)
--kg*: 7 navn, 18 def, 2 filer (css/web39.css,css/web44-dark.css)
--upd*: 6 navn, 12 def, 2 filer (css/app.css,css/paper.css)
--dx*: 5 navn, 14 def, 2 filer (css/app.css,css/web44-dark.css)
--sb*: 5 navn, 29 def, 4 filer (css/app.css,css/web30.css,css/web44-dark.css,finans/css/mobile.css)
--bk*: 5 navn, 11 def, 2 filer (css/backup.css,css/web44-dark.css)
--u*: 5 navn, 8 def, 1 filer (css/media-musikk.css)
--c40*: 5 navn, 20 def, 2 filer (css/web40.css,css/web44-dark.css)
--ga*: 5 navn, 15 def, 1 filer (css/web45.css)
--p88*: 5 navn, 5 def, 1 filer (css/web88-dark.css)
--rev*: 5 navn, 19 def, 1 filer (finans/css/finans.css)
--h40*: 5 navn, 15 def, 1 filer (finans/css/mobile.css)
--blue*: 4 navn, 20 def, 5 filer (css/app.css,css/paper.css,css/web40.css,css/web44.css,finans/css/finans.css)
--acc*: 4 navn, 34 def, 8 filer (css/kal39.css,css/news.css,css/paper.css,css/web40.css,css/web44-dark.css,css/web44.css…)
--n*: 4 navn, 6 def, 1 filer (css/media-nrk.css)
--seg*: 4 navn, 15 def, 2 filer (css/web41.css,css/web44-dark.css)
--red*: 3 navn, 15 def, 6 filer (css/app.css,css/kal39.css,css/paper.css,css/web40.css,css/web44-dark.css,css/web46.css)
--bg*: 3 navn, 17 def, 7 filer (css/app.css,css/kal39.css,css/news.css,css/web40.css,css/web44-dark.css,css/web66-sys.css…)
--gb*: 3 navn, 3 def, 1 filer (css/web35.css)
--hl*: 3 navn, 24 def, 2 filer (css/web40.css,css/web44-dark.css)
--warm*: 3 navn, 12 def, 1 filer (finans/css/finans.css)
--card2*: 3 navn, 12 def, 1 filer (finans/css/finans.css)
--text*: 2 navn, 16 def, 5 filer (css/app.css,css/paper.css,css/web40.css,css/web44-dark.css,finans/css/finans.css)
--purple*: 2 navn, 10 def, 3 filer (css/app.css,css/paper.css,finans/css/finans.css)
--pad*: 2 navn, 3 def, 2 filer (css/app.css,css/web46.css)
--tint*: 2 navn, 8 def, 2 filer (css/kal39.css,css/web40.css)
--today*: 2 navn, 2 def, 1 filer (css/kal39.css)
--warn*: 2 navn, 13 def, 3 filer (css/media43.css,css/web66-sys.css,finans/css/finans.css)
--av46*: 2 navn, 5 def, 1 filer (css/web46.css)
--link*: 2 navn, 8 def, 1 filer (finans/css/finans.css)
--font*: 2 navn, 8 def, 1 filer (finans/css/finans.css)
--accf*: 2 navn, 4 def, 1 filer (finans/css/finans.css)
--p29*: 2 navn, 4 def, 1 filer (finans/css/mobile.css)
--page*: 1 navn, 4 def, 3 filer (css/app.css,css/paper.css,css/web44-dark.css)
--lock*: 1 navn, 4 def, 3 filer (css/app.css,css/paper.css,css/web44-dark.css)
--card*: 1 navn, 18 def, 8 filer (css/app.css,css/kal39.css,css/news.css,css/paper.css,css/web40.css,css/web44-dark.css…)
--row*: 1 navn, 4 def, 3 filer (css/app.css,css/paper.css,css/web44-dark.css)
--line*: 1 navn, 20 def, 8 filer (css/app.css,css/kal39.css,css/news.css,css/paper.css,css/web40.css,css/web44-dark.css…)
--field*: 1 navn, 4 def, 3 filer (css/app.css,css/paper.css,css/web44-dark.css)
--glass*: 1 navn, 7 def, 4 filer (css/app.css,css/kal39.css,css/paper.css,css/web40.css)
--pill*: 1 navn, 4 def, 3 filer (css/app.css,css/paper.css,css/web44-dark.css)
--muted*: 1 navn, 12 def, 5 filer (css/app.css,css/paper.css,css/web40.css,css/web44-dark.css,finans/css/finans.css)
--faint*: 1 navn, 3 def, 3 filer (css/app.css,css/paper.css,css/web44.css)
--green*: 1 navn, 9 def, 5 filer (css/app.css,css/paper.css,css/web40.css,css/web44-dark.css,css/web44.css)
--yellow*: 1 navn, 4 def, 3 filer (css/app.css,css/paper.css,css/web44.css)
--pink*: 1 navn, 2 def, 2 filer (css/app.css,css/paper.css)
--gap*: 1 navn, 3 def, 2 filer (css/app.css,css/paper.css)
--side*: 1 navn, 9 def, 3 filer (css/app.css,css/paper.css,finans/css/finans.css)
--mono*: 1 navn, 8 def, 5 filer (css/app.css,css/kal39.css,css/paper.css,finans/css/finans.css,finans/css/mobile.css)
--cb*: 1 navn, 7 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--cc*: 1 navn, 6 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--ci*: 1 navn, 7 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--cm*: 1 navn, 6 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--cl*: 1 navn, 6 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--ca*: 1 navn, 5 def, 2 filer (css/chat.css,finans/css/mobile.css)
--cs*: 1 navn, 7 def, 2 filer (css/chat.css,finans/css/mobile.css)
--cub*: 1 navn, 7 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--cuI*: 1 navn, 7 def, 3 filer (css/chat.css,css/web44-dark.css,finans/css/mobile.css)
--hf*: 1 navn, 6 def, 3 filer (css/chat.css,css/web66-sys.css,finans/css/mobile.css)
--ff*: 1 navn, 2 def, 1 filer (css/chat.css)
--l70card*: 1 navn, 1 def, 1 filer (css/chat70.css)
--l70ok*: 1 navn, 2 def, 1 filer (css/chat70.css)
--l70err*: 1 navn, 2 def, 1 filer (css/chat70.css)
--cd*: 1 navn, 10 def, 6 filer (css/claude-import43.css,css/media43.css,css/media70.css,css/web43.css,css/web44-dark.css,css/web45.css)
--ln*: 1 navn, 10 def, 6 filer (css/claude-import43.css,css/media43.css,css/media70.css,css/web43.css,css/web44-dark.css,css/web45.css)
--lb*: 1 navn, 5 def, 3 filer (css/claude-import43.css,css/media43.css,css/web43.css)
--mt*: 1 navn, 10 def, 6 filer (css/claude-import43.css,css/media43.css,css/media70.css,css/web43.css,css/web44-dark.css,css/web45.css)
--sf*: 1 navn, 2 def, 2 filer (css/claude-import43.css,css/media43.css)
--ink*: 1 navn, 14 def, 6 filer (css/kal39.css,css/news.css,css/paper.css,css/web40.css,css/web44-dark.css,css/web66-sys.css)
--chip*: 1 navn, 4 def, 2 filer (css/kal39.css,css/web40.css)
--line2*: 1 navn, 8 def, 3 filer (css/kal39.css,css/web40.css,finans/css/finans.css)
--mut*: 1 navn, 10 def, 4 filer (css/kal39.css,css/news.css,css/web40.css,css/web66-sys.css)
--mut2*: 1 navn, 4 def, 2 filer (css/kal39.css,css/web40.css)
--ink2*: 1 navn, 7 def, 4 filer (css/kal39.css,css/paper.css,css/web40.css,css/web44-dark.css)
--sun*: 1 navn, 4 def, 2 filer (css/kal39.css,css/web40.css)
--dim*: 1 navn, 8 def, 3 filer (css/kal39.css,css/web40.css,finans/css/finans.css)
--serif*: 1 navn, 2 def, 2 filer (css/kal39.css,css/paper.css)
--ui*: 1 navn, 1 def, 1 filer (css/kal39.css)
--monoh*: 1 navn, 1 def, 1 filer (css/kal39.css)
--pw*: 1 navn, 9 def, 2 filer (css/kalender.css,css/paper.css)
--ok*: 1 navn, 11 def, 4 filer (css/media43.css,css/web45.css,css/web66-sys.css,finans/css/finans.css)
--warn2*: 1 navn, 2 def, 1 filer (css/media43.css)
--bad*: 1 navn, 7 def, 3 filer (css/media43.css,css/web45.css,css/web66-sys.css)
--gr*: 1 navn, 2 def, 1 filer (css/media43.css)
--lab*: 1 navn, 3 def, 1 filer (css/news.css)
--ink3*: 1 navn, 3 def, 3 filer (css/paper.css,css/web40.css,css/web44-dark.css)
--rule*: 1 navn, 3 def, 3 filer (css/paper.css,css/web40.css,css/web44-dark.css)
--rule2*: 1 navn, 3 def, 3 filer (css/paper.css,css/web40.css,css/web44-dark.css)
--sans*: 1 navn, 1 def, 1 filer (css/paper.css)
--pmono*: 1 navn, 1 def, 1 filer (css/paper.css)
--wf*: 1 navn, 1 def, 1 filer (css/weather.css)
--w31*: 1 navn, 3 def, 2 filer (css/web31.css,css/web65.css)
--dm71*: 1 navn, 2 def, 1 filer (css/web32.css)
--vcard*: 1 navn, 1 def, 1 filer (css/web36.css)
--vsky*: 1 navn, 1 def, 1 filer (css/web36.css)
--wc*: 1 navn, 23 def, 1 filer (css/web40.css)
--wic*: 1 navn, 23 def, 1 filer (css/web40.css)
--lab40*: 1 navn, 6 def, 2 filer (css/web40.css,css/web44-dark.css)
--ic40bg*: 1 navn, 1 def, 1 filer (css/web40.css)
--neg40*: 1 navn, 1 def, 1 filer (css/web40.css)
--o*: 1 navn, 1 def, 1 filer (css/web43.css)
--hl40*: 1 navn, 2 def, 2 filer (css/web44-dark.css,css/web46.css)
--neg*: 1 navn, 6 def, 2 filer (css/web44-dark.css,finans/css/finans.css)
--dl*: 1 navn, 2 def, 1 filer (css/web45.css)
--wait*: 1 navn, 2 def, 1 filer (css/web45.css)
--svc*: 1 navn, 5 def, 1 filer (css/web45.css)
--t52card*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52ink*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52mut*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52lab*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52line*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52pos*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52av*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52avi*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52avs*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52mat*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52mati*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52matl*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52fam*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52fami*: 1 navn, 2 def, 1 filer (css/web52.css)
--t52faml*: 1 navn, 2 def, 1 filer (css/web52.css)
--fld*: 1 navn, 3 def, 1 filer (css/web66-sys.css)
--inner*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--sep*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--line3*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--text2*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--note*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--gold*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--hover*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--warm2*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--deep*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--pop*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--skel*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--tag*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--nav*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--badge*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--av*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--dw*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--r2*: 1 navn, 4 def, 1 filer (finans/css/finans.css)
--fh*: 1 navn, 2 def, 1 filer (finans/css/finn.css)
--m*: 1 navn, 5 def, 1 filer (finans/css/mobile.css)
--hcar*: 1 navn, 1 def, 1 filer (finans/css/mobile.css)
--wxh*: 1 navn, 1 def, 1 filer (finans/css/mobile.css)
--sys*: 1 navn, 1 def, 1 filer (finans/css/mobile.css)
--wa*: 1 navn, 4 def, 1 filer (finans/css/mobile.css)
--wm*: 1 navn, 6 def, 1 filer (finans/css/mobile.css)
--wl*: 1 navn, 6 def, 1 filer (finans/css/mobile.css)
--p31m*: 1 navn, 2 def, 1 filer (finans/css/mobile.css)
--f41l*: 1 navn, 1 def, 1 filer (finans/css/mobile.css)
--f41w*: 1 navn, 2 def, 1 filer (finans/css/mobile.css)
--p46*: 1 navn, 2 def, 1 filer (finans/css/mobile.css)
--p51*: 1 navn, 1 def, 1 filer (finans/css/plan51.css)
var() brukt men aldri definert i CSS: 86 --ac-sticky-top --tc --paper --sc --s --lt --k2-top --n --hh --tx --sc89-water --mat-bg --mat-card --mat-in --mat-line --mat-t --mat-acc --st --sk79-bot --fg --dgc --dgr --dgg --pg --k38-kb --d --pc --k46-hide --bk66-ind --nc --ic --kc --pp-on --p-d --p-dw --m3-7BE3A0 --m3-F0DFD7 --m3-D7C2B8 --m3-532200 --m3-FFDBC8
definert men aldri brukt i CSS: 250```

## V3. CSS-dekning (21 ruter × 4 temaer desktop + 3 temaer mobil + FinansHub)
```
/assets/finans/css/mobile.css                751.1KB    8% brukt
/assets/finans/css/finans.css                 69.8KB   29% brukt
/assets/css/app.css                           83.0KB   43% brukt
/assets/css/web44.css                         57.9KB   19% brukt
/assets/finans/css/fin42.css                  40.4KB    5% brukt
/assets/finans/css/finn.css                   30.5KB    0% brukt
/assets/css/web44-dark.css                    42.8KB   32% brukt
/assets/css/web38.css                         28.3KB   11% brukt
/assets/css/web41.css                         26.8KB   11% brukt
/assets/css/paper.css                         55.9KB   58% brukt
/assets/css/family50.css                      32.1KB   27% brukt
/assets/css/family.css                        24.0KB    9% brukt
/assets/css/web45.css                         23.3KB   11% brukt
/assets/css/web36.css                         27.8KB   29% brukt
/assets/css/media43.css                       20.4KB    6% brukt
/assets/css/kalender.css                      21.4KB   13% brukt
/assets/css/media-nrk.css                     18.5KB    0% brukt
/assets/css/web46.css                         26.6KB   39% brukt
/assets/css/media70.css                       26.9KB   42% brukt
/assets/css/web30.css                         19.3KB   21% brukt
/assets/css/web40.css                         31.7KB   53% brukt
/assets/css/web39.css                         20.1KB   28% brukt
/assets/css/web35.css                         20.9KB   33% brukt
/assets/css/weather.css                       24.3KB   42% brukt
/assets/finans/css/fin52.css                  12.5KB    1% brukt
/assets/css/skjold76.css                      19.3KB   37% brukt
/assets/css/kal39.css                         23.0KB   51% brukt
/assets/css/chat.css                          16.9KB   35% brukt
/assets/css/ai-control.css                    17.9KB   40% brukt
/assets/css/web65.css                         27.5KB   61% brukt
/assets/css/tasks.css                         17.7KB   40% brukt
/assets/css/skjold77.css                       9.9KB    2% brukt
/assets/css/web43.css                         10.9KB   12% brukt
/assets/css/web52.css                         14.7KB   37% brukt
/assets/css/media-musikk.css                   8.6KB    0% brukt
/assets/finans/css/logo73.css                  8.5KB    0% brukt
/assets/css/web37.css                          8.5KB    0% brukt
/assets/css/web32.css                         10.4KB   19% brukt
/assets/css/web31.css                         13.4KB   37% brukt
/assets/css/receipts48.css                     7.9KB    0% brukt
/api/family/vendor/leaflet.css                14.5KB   45% brukt
/assets/css/tracking.css                      14.4KB   51% brukt
/assets/css/mat.css                           21.2KB   67% brukt
/assets/css/web42.css                          7.9KB   12% brukt
/assets/css/skjold78.css                       7.3KB    5% brukt
/assets/css/skjold79.css                       7.5KB    9% brukt
/assets/finans/css/plan51.css                 10.9KB   38% brukt
/assets/css/birthdays.css                     12.8KB   51% brukt
/assets/css/web66-sys.css                      7.8KB   25% brukt
/assets/css/skjold82.css                       4.6KB    0% brukt
/assets/css/backup.css                         4.9KB   40% brukt
/assets/css/media50.css                        2.7KB    3% brukt
/assets/css/web88-dark.css                     3.6KB   27% brukt
/assets/css/receipts51.css                     2.6KB    0% brukt
/assets/css/glimt-figs.css                     2.6KB    2% brukt
/assets/css/chat70.css                         7.4KB   67% brukt
/assets/css/web34.css                          1.6KB    0% brukt
/assets/css/space.css                          8.8KB   83% brukt
/assets/css/web73-brief.css                    2.4KB   56% brukt
/assets/css/media.css                          3.3KB   95% brukt
```

## V4. Overstyringer på eksakt samme selektor+egenskap (app.html-rekkefølge)
```
unike (selektor,egenskap,kontekst): 98789  definert i >1 fil: 405
topp overstyringspar (tidlig → senere):
  84  web30 → web32
  65  web36 → web38
  45  web30 → web31
  18  web38 → kal39
  18  web44-dark → web88-dark
  14  app → web65
  14  web42 → web65
  14  web44 → web45
  12  web40 → web45
  11  tasks → web52
  11  weather → web52
  11  kalender → web38
  11  web38 → web52
  9  app → web46
  9  web35 → web65
  9  web43 → web46
  6  chat → web46
  5  app → web41
  5  app → paper
  5  family → web42
  5  paper → web41
  4  app → web36
  4  app → web30
  4  app → web31
  4  web46 → web65
!important-kjeder (≥2 filer med !important på samme sel/egenskap): 12
  .set-done|position| :: web30!=fixed > web31!=absolute
  .k2-sheet|animation-duration|@(prefers-reduced-motion: reduce) :: web38!=auto > web52!=0.15s
  .k2-sheet|animation-timing-function|@(prefers-reduced-motion: reduce) :: web38!=ease > web52!=ease-out
  .k2-sheet|animation-delay|@(prefers-reduced-motion: reduce) :: web38!=0s > web52!=0s
  .k2-sheet|animation-iteration-count|@(prefers-reduced-motion: reduce) :: web38!=1 > web52!=1
  .k2-sheet|animation-direction|@(prefers-reduced-motion: reduce) :: web38!=normal > web52!=normal
  .k2-sheet|animation-fill-mode|@(prefers-reduced-motion: reduce) :: web38!=none > web52!=both
  .k2-sheet|animation-play-state|@(prefers-reduced-motion: reduce) :: web38!=running > web52!=running
  .k2-sheet|animation-name|@(prefers-reduced-motion: reduce) :: web38!=none > web52!=fade71
  .k2-sheet|animation-timeline|@(prefers-reduced-motion: reduce) :: web38!=auto > web52!=auto
  .k2-sheet|animation-range-start|@(prefers-reduced-motion: reduce) :: web38!=normal > web52!=normal
  .k2-sheet|animation-range-end|@(prefers-reduced-motion: reduce) :: web38!=normal > web52!=normal
dypeste lag:
  4 filer: .mono|font-family| :: app > family > birthdays > web44
  3 filer: #settings|padding-top| :: app > web30 > web31
  3 filer: #settings|padding-right| :: app > web30 > web31
  3 filer: #settings|padding-bottom| :: app > web30 > web31
  3 filer: #settings|padding-left| :: app > web30 > web31
  2 filer: *|scrollbar-width| :: app > web36!
  2 filer: ::-webkit-scrollbar|display| :: app > web36!
  2 filer: ::-webkit-scrollbar|width| :: app > web36!
  2 filer: ::-webkit-scrollbar|height| :: app > web36!
  2 filer: .bg-layer|transition-behavior| :: app > web41
  2 filer: .bg-layer|transition-duration| :: app > web41
  2 filer: .bg-layer|transition-timing-function| :: app > web41
per fil: deklarasjoner overstyrt av senere fil / totalt
  app: 42/11065
  tracking: 0/1656
  family: 9/3277
  tasks: 11/2720
  paper: 5/7629
  weather: 11/3105
  birthdays: 4/1829
  kalender: 14/2970
  chat: 6/2789
  chat70: 0/1127
  backup: 0/509
  web30: 129/2685
  web31: 0/1362
  web32: 0/1231
  web34: 0/117
  glimt-figs: 0/110
  web35: 11/3228
  web36: 65/3598
  web37: 0/1259
  web38: 29/3488
  kal39: 1/3517
  web39: 1/2770
  web40: 14/3194
  web41: 0/3903
  web42: 14/1046
  web43: 9/1399
  web44: 14/9726
  web44-dark: 18/3098
  web45: 0/3039
  web46: 4/3908
  web52: 0/1990
  web65: 0/5813
  web66-sys: 0/604
  web88-dark: 0/280
```

## V5. Klasser stylet i mange filer

Se hovedrapporten §1.4 (47 klasser er mål i ≥5 CSS-filer, 243 i ≥3; f.eks. `.on` i 42 filer, `.ok`/`.red` i 23, `.card` i 6).

## V6. Døde regler (klassenavn finnes ikke i noen JS/HTML i public/ eller server/)
```
regler totalt 20095 helt døde (minst én klasse i hver selektor finnes ikke i noen JS/HTML): 1120 5.6%
finans/css/mobile.css|7535|397|5%
css/app.css|990|109|11%
css/paper.css|577|107|19%
css/media43.css|277|89|32%
finans/css/finans.css|754|40|5%
css/kalender.css|242|34|14%
css/web44-dark.css|453|34|8%
css/weather.css|294|32|11%
css/web44.css|622|26|4%
css/tracking.css|171|23|13%
finans/css/finn.css|366|21|6%
css/web36.css|241|19|8%
finans/css/fin42.css|442|19|4%
css/web38.css|257|18|7%
css/web31.css|124|17|14%
css/web42.css|95|15|16%
css/web40.css|249|14|6%
css/family.css|270|11|4%
css/web45.css|224|11|5%
css/media70.css|342|10|3%
css/kal39.css|255|9|4%
css/web35.css|219|8|4%
css/tasks.css|199|7|4%
css/news.css|192|6|3%
css/web46.css|243|6|2%
css/web65.css|189|6|3%
css/chat.css|182|5|3%
css/family50.css|293|4|1%
css/web30.css|198|4|2%
css/web41.css|282|4|1%
```

## V7. Fargeklynger
```
ugjennomsiktige unike farger: 928  med alfa: 470 ( 2052 bruk), uparset (color-mix, var osv): 81
klynger (ΔE<5): 354 ; klynger med ≥5 nyanser: 33
#ffffff ×1030 – 18 nyanser: #ffffff #fffdf8 #f4f4f6 #fbf8f1 #faf8f3 #f6f6f6 #f4f6fa #fbf9f4
#1b1a17 ×876 – 43 nyanser: #1b1a17 #211e18 #16140f #161513 #14130f #211f1b #121210 #211f19
#f3efe6 ×658 – 46 nyanser: #f3efe6 #efe9de #ece7dc #ece8df #ece6da #f4f1ea #ebe5d8 #f1ece2
#b23a2a ×380 – 3 nyanser: #b23a2a #b8452f #ad3327
#d8d1c2 ×272 – 22 nyanser: #d8d1c2 #e3ddcf #ddd5c5 #d9d3c6 #d6d3cc #d6cdbb #e3dccd #cfc8ba
#3a352c ×205 – 20 nyanser: #3a352c #3d3a33 #3b3731 #34322a #3a362e #3a372e #3a372f #3a3732
#6b665c ×129 – 8 nyanser: #6b665c #6f6a5f #6b6558 #716b5e #67625a #726d62 #6c675e #6b6457
#0c1119 ×126 – 27 nyanser: #0c1119 #0b0e15 #17191e #16161b #0b1220 #111723 #111113 #16181d
#2f7a4f ×122 – 4 nyanser: #2f7a4f #2f7d4f #2d774b #2f7d55
#eef0f4 ×112 – 15 nyanser: #eef0f4 #e9eef7 #e3e5e8 #eef1f6 #e6ecef #e6ecf5 #dfe8f1 #e8ecef
#a39d90 ×109 – 13 nyanser: #a39d90 #a49d91 #b0a998 #a9a397 #a8a294 #b3a597 #9a958a #a59e90
#232938 ×109 – 16 nyanser: #232938 #1f2736 #232b3a #1d2738 #1c2230 #1c2331 #1a2231 #18202e
#2c3548 ×102 – 11 nyanser: #2c3548 #2a3346 #2a3440 #2c3446 #2c3a52 #262f40 #2f3a4c #232c40
#ec7a64 ×101 – 5 nyanser: #ec7a64 #e8705c #e0705f #e0705e #f07a6c
#262628 ×101 – 22 nyanser: #262628 #2a2d34 #20232a #2a2a31 #2b2824 #2a2925 #24242c #202124
#e6dfd1 ×79 – 14 nyanser: #e6dfd1 #e6e0d3 #f0dfd7 #e9e2d3 #f3e3d9 #e6e0d2 #e4e0d8 #e4e0d6
#8a93a6 ×60 – 2 nyanser: #8a93a6 #7f8fa8
#000000 ×60 – 16 nyanser: #000000 #07080b #07070a #0b0b0e #0f0f13 #0a0c12 #0a0a0c #050504
#8f897c ×59 – 11 nyanser: #8f897c #8a8478 #8a8578 #8a857b #8f887b #8c867b #938d80 #8a857a
#2a261f ×58 – 17 nyanser: #2a261f #2c221c #2b2720 #2e2b26 #31281f #2c2821 #2a2821 #2c2a25
#ff7a3d ×54 – 1 nyanser: #ff7a3d
#ffd9c2 ×47 – 3 nyanser: #ffd9c2 #ffdbc8 #f6d6b8
#3a4560 ×44 – 2 nyanser: #3a4560 #34405a
#6fbf8f ×43 – 6 nyanser: #6fbf8f #6fc28f #6fbf8e #7fc79a #6fbf8a #5fb383
#f59a8f ×41 – 6 nyanser: #f59a8f #f29a8a #ff9c8c #f19a88 #f2a191 #ff9a8f
```

## V8. Ytelse (rå JSON per rute/profil)
```json
[
 {
  "profile": "desktop",
  "route": "dash",
  "dcl": 635,
  "load": {
   "Layout": 0.115,
   "LayoutCount": 33,
   "Recalc": 0.081,
   "RecalcCount": 93,
   "Script": 0.088,
   "Task": 0.902,
   "Heap": 7,
   "Nodes": 2570,
   "Listeners": 648
  },
  "fcp": 228,
  "lcp": 1668,
  "lcpEl": "DIV.pw-img on",
  "cls": 0.433,
  "dom": 1085,
  "mut": 281,
  "mutNodes": 237,
  "imgs": 7,
  "imgNoLazy": 0,
  "imgNoSize": 6,
  "sheets": 55,
  "ltCount": 1,
  "ltTotal": 102,
  "ltMax": 102,
  "css": {
   "n": 42,
   "enc": 250901,
   "dec": 853158
  },
  "js": {
   "n": 179,
   "enc": 1337840,
   "dec": 3307577
  },
  "all": {
   "n": 329,
   "enc": 2721796
  },
  "api": 78,
  "idle20s": {
   "mut": 24,
   "mutNodes": 72,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0.007,
   "LayoutCount": 21,
   "Recalc": 0.008,
   "RecalcCount": 23,
   "Script": 0.022,
   "Task": 0.117,
   "HeapEnd": 6,
   "NodesEnd": 2760
  },
  "errs": []
 },
 {
  "profile": "desktop",
  "route": "media",
  "dcl": 706,
  "load": {
   "Layout": 0.082,
   "LayoutCount": 29,
   "Recalc": 0.058,
   "RecalcCount": 92,
   "Script": 0.102,
   "Task": 0.723,
   "Heap": 5,
   "Nodes": 4060,
   "Listeners": 642
  },
  "fcp": 252,
  "lcp": 1204,
  "lcpEl": "P.m70-npt",
  "cls": 0.357,
  "dom": 439,
  "mut": 224,
  "mutNodes": 158,
  "imgs": 0,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 55,
  "ltCount": 0,
  "ltTotal": 0,
  "ltMax": 0,
  "css": {
   "n": 42,
   "enc": 250901,
   "dec": 853158
  },
  "js": {
   "n": 181,
   "enc": 1343284,
   "dec": 3315284
  },
  "all": {
   "n": 304,
   "enc": 2155509
  },
  "api": 77,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.002,
   "Task": 0.024,
   "HeapEnd": 5,
   "NodesEnd": 4060
  },
  "errs": []
 },
 {
  "profile": "desktop",
  "route": "finans",
  "dcl": 212,
  "load": {
   "Layout": 0.058,
   "LayoutCount": 8,
   "Recalc": 0.032,
   "RecalcCount": 80,
   "Script": 0.037,
   "Task": 0.346,
   "Heap": 2,
   "Nodes": 2320,
   "Listeners": 118
  },
  "fcp": 220,
  "lcp": 364,
  "lcpEl": "H1.",
  "cls": 0,
  "dom": 587,
  "mut": 58,
  "mutNodes": 40,
  "imgs": 6,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 21,
  "ltCount": 0,
  "ltTotal": 0,
  "ltMax": 0,
  "css": {
   "n": 9,
   "enc": 196989,
   "dec": 957488
  },
  "js": {
   "n": 39,
   "enc": 343032,
   "dec": 872099
  },
  "all": {
   "n": 65,
   "enc": 695226
  },
  "api": 10,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.002,
   "Task": 0.022,
   "HeapEnd": 2,
   "NodesEnd": 2320
  },
  "errs": []
 },
 {
  "profile": "desktop",
  "route": "skjold",
  "dcl": 768,
  "load": {
   "Layout": 0.13,
   "LayoutCount": 11,
   "Recalc": 0.032,
   "RecalcCount": 34,
   "Script": 0.075,
   "Task": 0.712,
   "Heap": 5,
   "Nodes": 1851,
   "Listeners": 645
  },
  "fcp": 200,
  "lcp": 1296,
  "lcpEl": "DIV.pw-img on",
  "cls": 0.613,
  "dom": 803,
  "mut": 230,
  "mutNodes": 163,
  "imgs": 0,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 59,
  "ltCount": 0,
  "ltTotal": 0,
  "ltMax": 0,
  "css": {
   "n": 47,
   "enc": 269815,
   "dec": 903065
  },
  "js": {
   "n": 191,
   "enc": 1430634,
   "dec": 3542131
  },
  "all": {
   "n": 305,
   "enc": 2054837
  },
  "api": 63,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.002,
   "Task": 0.01,
   "HeapEnd": 5,
   "NodesEnd": 1851
  },
  "errs": []
 },
 {
  "profile": "desktop",
  "route": "kalender",
  "dcl": 687,
  "load": {
   "Layout": 0.069,
   "LayoutCount": 9,
   "Recalc": 0.04,
   "RecalcCount": 77,
   "Script": 0.092,
   "Task": 0.712,
   "Heap": 5,
   "Nodes": 2855,
   "Listeners": 657
  },
  "fcp": 176,
  "lcp": 1320,
  "lcpEl": "DIV.pw-img on",
  "cls": 0.318,
  "dom": 706,
  "mut": 207,
  "mutNodes": 144,
  "imgs": 0,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 54,
  "ltCount": 0,
  "ltTotal": 0,
  "ltMax": 0,
  "css": {
   "n": 42,
   "enc": 250901,
   "dec": 853158
  },
  "js": {
   "n": 179,
   "enc": 1337840,
   "dec": 3307577
  },
  "all": {
   "n": 286,
   "enc": 2213028
  },
  "api": 61,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.002,
   "Task": 0.02,
   "HeapEnd": 5,
   "NodesEnd": 2855
  },
  "errs": []
 },
 {
  "profile": "mobil",
  "route": "dash",
  "dcl": 1171,
  "load": {
   "Layout": 0.257,
   "LayoutCount": 22,
   "Recalc": 0.17,
   "RecalcCount": 62,
   "Script": 0.327,
   "Task": 2.444,
   "Heap": 5,
   "Nodes": 2596,
   "Listeners": 643
  },
  "fcp": 436,
  "lcp": 2556,
  "lcpEl": "DIV.pw-img on",
  "cls": 0.154,
  "dom": 959,
  "mut": 274,
  "mutNodes": 293,
  "imgs": 7,
  "imgNoLazy": 0,
  "imgNoSize": 6,
  "sheets": 55,
  "ltCount": 4,
  "ltTotal": 625,
  "ltMax": 315,
  "css": {
   "n": 42,
   "enc": 250901,
   "dec": 853158
  },
  "js": {
   "n": 179,
   "enc": 1337840,
   "dec": 3307577
  },
  "all": {
   "n": 313,
   "enc": 2041450
  },
  "api": 78,
  "idle20s": {
   "mut": 23,
   "mutNodes": 59,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0.042,
   "LayoutCount": 22,
   "Recalc": 0.03,
   "RecalcCount": 24,
   "Script": 0.061,
   "Task": 0.447,
   "HeapEnd": 4,
   "NodesEnd": 1602
  },
  "errs": []
 },
 {
  "profile": "mobil",
  "route": "media",
  "dcl": 1513,
  "load": {
   "Layout": 0.208,
   "LayoutCount": 26,
   "Recalc": 0.141,
   "RecalcCount": 73,
   "Script": 0.408,
   "Task": 2.294,
   "Heap": 5,
   "Nodes": 3585,
   "Listeners": 645
  },
  "fcp": 404,
  "lcp": 2452,
  "lcpEl": "P.m70-npt",
  "cls": 0.082,
  "dom": 433,
  "mut": 220,
  "mutNodes": 145,
  "imgs": 0,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 55,
  "ltCount": 4,
  "ltTotal": 412,
  "ltMax": 179,
  "css": {
   "n": 42,
   "enc": 250901,
   "dec": 853158
  },
  "js": {
   "n": 181,
   "enc": 1343284,
   "dec": 3315284
  },
  "all": {
   "n": 303,
   "enc": 2023120
  },
  "api": 77,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.008,
   "Task": 0.148,
   "HeapEnd": 4,
   "NodesEnd": 757
  },
  "errs": []
 },
 {
  "profile": "mobil",
  "route": "finans",
  "dcl": 297,
  "load": {
   "Layout": 0.526,
   "LayoutCount": 56,
   "Recalc": 0.939,
   "RecalcCount": 136,
   "Script": 0.364,
   "Task": 5.156,
   "Heap": 6,
   "Nodes": 1818,
   "Listeners": 200
  },
  "fcp": 232,
  "lcp": 3468,
  "lcpEl": "DIV.pp-ghero",
  "cls": 0,
  "dom": 436,
  "mut": 249,
  "mutNodes": 131,
  "imgs": 2,
  "imgNoLazy": 1,
  "imgNoSize": 2,
  "sheets": 15,
  "ltCount": 24,
  "ltTotal": 1886,
  "ltMax": 229,
  "css": {
   "n": 9,
   "enc": 196989,
   "dec": 957488
  },
  "js": {
   "n": 88,
   "enc": 1074894,
   "dec": 2842135
  },
  "all": {
   "n": 238,
   "enc": 2478883
  },
  "api": 133,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.004,
   "Task": 0.127,
   "HeapEnd": 5,
   "NodesEnd": 734
  },
  "errs": []
 },
 {
  "profile": "mobil",
  "route": "skjold",
  "dcl": 1169,
  "load": {
   "Layout": 0.163,
   "LayoutCount": 11,
   "Recalc": 0.134,
   "RecalcCount": 28,
   "Script": 0.303,
   "Task": 1.91,
   "Heap": 5,
   "Nodes": 1846,
   "Listeners": 648
  },
  "fcp": 384,
  "lcp": 2168,
  "lcpEl": "DIV.pw-img on",
  "cls": 0.427,
  "dom": 797,
  "mut": 231,
  "mutNodes": 158,
  "imgs": 0,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 59,
  "ltCount": 5,
  "ltTotal": 458,
  "ltMax": 164,
  "css": {
   "n": 47,
   "enc": 250901,
   "dec": 903065
  },
  "js": {
   "n": 191,
   "enc": 1430634,
   "dec": 3542131
  },
  "all": {
   "n": 306,
   "enc": 2038476
  },
  "api": 64,
  "idle20s": {
   "mut": 0,
   "mutNodes": 0,
   "lt": 1,
   "ltMs": 54,
   "Layout": 0,
   "LayoutCount": 0,
   "Recalc": 0,
   "RecalcCount": 0,
   "Script": 0.009,
   "Task": 0.24,
   "HeapEnd": 4,
   "NodesEnd": 1270
  },
  "errs": []
 },
 {
  "profile": "mobil",
  "route": "kalender",
  "dcl": 2094,
  "load": {
   "Layout": 0.148,
   "LayoutCount": 12,
   "Recalc": 0.168,
   "RecalcCount": 57,
   "Script": 0.36,
   "Task": 2.654,
   "Heap": 5,
   "Nodes": 2186,
   "Listeners": 660
  },
  "fcp": 756,
  "lcp": 3420,
  "lcpEl": "DIV.pw-img on",
  "cls": 0.11,
  "dom": 700,
  "mut": 206,
  "mutNodes": 129,
  "imgs": 0,
  "imgNoLazy": 0,
  "imgNoSize": 0,
  "sheets": 54,
  "ltCount": 7,
  "ltTotal": 749,
  "ltMax": 205,
  "css": {
   "n": 42,
   "enc": 250901,
   "dec": 853158
  },
  "js": {
   "n": 179,
   "enc": 1337840,
   "dec": 3307577
  },
  "all": {
   "n": 287,
   "enc": 2215586
  },
  "api": 62,
  "idle20s": {
   "mut": 1,
   "mutNodes": 12,
   "lt": 0,
   "ltMs": 0,
   "Layout": 0.011,
   "LayoutCount": 1,
   "Recalc": 0.013,
   "RecalcCount": 4,
   "Script": 0.029,
   "Task": 0.268,
   "HeapEnd": 5,
   "NodesEnd": 1894
  },
  "errs": []
 }
]```

## V9. Tvungne layout (forced reflow) fra Chrome-trace
```
trace-desktop-dash.json forced 65 ms 94.1
   19x 32.2ms U js/dash-edit36.js:179 measure
   1x 29.2ms L js/dash-edit36.js:180 measure
   4x 12.2ms L js/scrollmem.js:50 step
   1x 8.7ms L js/qa51.js:164 showWhatsNew51
   16x 7.7ms U js/scrollmem.js:50 step
   2x 2.1ms U js/qa51.js:164 showWhatsNew51
   18x 0.8ms L js/dash-edit36.js:179 measure
   1x 0.6ms U js/web52.js:50 pageEnter
trace-desktop-finans.json forced 26 ms 33.2
   1x 11.9ms L finans/js/desktop.js:985 contentTop87
   18x 6.2ms U js/scrollmem.js:50 step
   1x 5.8ms L finans/js/whatsnew52.js:101 showWhatsNew52
   2x 2.7ms U finans/js/whatsnew52.js:101 showWhatsNew52
   1x 2.7ms L js/scrollmem.js:50 step
   1x 2.5ms U finans/js/desktop.js:985 contentTop87
   1x 1.2ms U finans/js/desktop.js:1071 route
   1x 0.1ms L finans/js/desktop.js:1071 route
trace-desktop-kalender.json forced 39 ms 63.6
   1x 27.8ms L js/kal39.js:378 startScroll
   2x 5.9ms U js/kalender.js:821 paint
   2x 5.6ms L js/kalender.js:821 paint
   1x 5.4ms L js/qa51.js:164 showWhatsNew51
   22x 5.1ms U js/scrollmem.js:50 step
   1x 4.6ms U js/kal39.js:378 startScroll
   1x 3.0ms L js/scrollmem.js:44 pinTop
   2x 3.0ms U js/web52.js:50 pageEnter
trace-desktop-media.json forced 73 ms 91.8
   15x 33.1ms L js/media43.js:535 paintMain
   15x 18.1ms U js/media43.js:535 paintMain
   8x 16.0ms L js/media43.js:541 centerTab87
   8x 10.1ms U js/media43.js:541 centerTab87
   1x 6.8ms L js/qa51.js:164 showWhatsNew51
   16x 2.9ms U js/scrollmem.js:50 step
   2x 1.7ms U js/qa51.js:164 showWhatsNew51
   2x 1.7ms U js/web52.js:50 pageEnter
trace-desktop-skjold.json forced 14 ms 39.5
   1x 19.5ms L js/scrollmem.js:50 step
   1x 7.5ms L js/qa51.js:164 showWhatsNew51
   1x 4.3ms L js/scrollmem.js:44 pinTop
   2x 3.2ms U js/web52.js:50 pageEnter
   4x 2.8ms U js/scrollmem.js:50 step
   2x 2.0ms U js/qa51.js:164 showWhatsNew51
   1x 0.1ms L js/appicon.js:42 img.onload
   1x 0.1ms U js/scrollmem.js:44 pinTop
trace-mobil-dash.json forced 28 ms 217.0
   1x 95.0ms L js/scrollmem.js:44 pinTop
   2x 39.8ms U js/web52.js:50 pageEnter
   12x 26.2ms U js/scrollmem.js:50 step
   3x 19.7ms L js/scrollmem.js:50 step
   1x 13.9ms L js/qa51.js:164 showWhatsNew51
   2x 9.1ms U js/qa51.js:164 showWhatsNew51
   1x 7.0ms U js/bgsvc.js:185 fetchBg
   1x 3.0ms L js/bgsvc.js:185 fetchBg
trace-mobil-finans.json forced 132 ms 1017.2
   40x 395.8ms U finans/js/mobile-p43.js:241 bigOn
   39x 340.8ms L finans/js/mobile-p43.js:241 bigOn
   25x 125.3ms U finans/js/mobile-p41.js:108 foldOn
   6x 39.6ms U finans/js/mobile-p41.js:61 osloList
   2x 29.3ms U finans/js/mobile-p30.js:240 f
   6x 28.0ms U finans/js/mobile-bg.js:47 bgFetch
   1x 11.2ms L finans/js/whatsnew52.js:101 showWhatsNew52
   1x 8.6ms U finans/js/mobile-gate.js:147 showOnboarding
trace-mobil-kalender.json forced 35 ms 203.0
   1x 51.8ms L js/kal39.js:378 startScroll
   1x 37.0ms U js/kal39.js:378 startScroll
   2x 26.0ms U js/web52.js:50 pageEnter
   1x 19.4ms L js/qa51.js:164 showWhatsNew51
   1x 12.6ms L js/kalender.js:821 paint
   1x 11.3ms U js/kalender.js:821 paint
   2x 11.3ms U js/qa51.js:164 showWhatsNew51
   17x 10.2ms U js/scrollmem.js:50 step
trace-mobil-media.json forced 66 ms 230.6
   13x 81.3ms L js/media43.js:535 paintMain
   6x 32.3ms L js/media43.js:541 centerTab87
   13x 29.9ms U js/media43.js:535 paintMain
   6x 29.1ms U js/media43.js:541 centerTab87
   1x 21.3ms L js/qa51.js:164 showWhatsNew51
   15x 10.7ms U js/scrollmem.js:50 step
   2x 8.7ms U js/qa51.js:164 showWhatsNew51
   2x 5.5ms U js/profile-menu.js:70 
trace-mobil-skjold.json forced 16 ms 102.7
   1x 32.6ms L js/qa51.js:164 showWhatsNew51
   2x 18.4ms U js/web52.js:50 pageEnter
   1x 17.1ms L js/scrollmem.js:44 pinTop
   1x 11.4ms U js/bgsvc.js:185 fetchBg
   2x 10.1ms U js/qa51.js:164 showWhatsNew51
   2x 7.3ms U js/profile-menu.js:70 
   1x 2.5ms L js/bgsvc.js:185 fetchBg
   3x 2.5ms U js/scrollmem.js:50 step
```

## V10. Komponentvarianter
```
kort: 149 klassenavn (143 «rot»-varianter) i 49 filer. eks: ac-card card tiles tile modal-box popup-box set-box cfg-card dm-card av-box sg-box speed-box tfa-box wxc-card bg-cards card-link bd-card ch-box ch70-box ci43-card fam-card pos-card f50-card k2-box kal-hw-card gq-box mp-cards mp-card mp-cook-card mu-card nrk-card nrk-box nrk-tile media-tile-art media-tile mh-card m43-card m70-card nw-card nw-box
knapp: 188 klassenavn (186 «rot»-varianter) i 58 filer. eks: ac-btns ac-chips o58-chip pill profile-btn btn btn-primary chips chip hp-btn row-btns dm-pills dm-btn dm-pill dm-chips lay-btn sg-btn sg-pill wxc-chips wxc-chip wxc-btn bg-chips upd-btns bk-chips bk-chip bd-chips bd-chip bd-btn ch-chip ch-btn ch-pill ch70-pill ch70-btns ci43-btn fam-chips fam-chip fam-btn f50-pill f50-chips f50-chip
ark_modal: 47 klassenavn (45 «rot»-varianter) i 29 filer. eks: modal modal-box popup popup-box popup-poster upd-sheet-bg upd-sheet bk-sheet drawer ch-sheet-bg ch-sheet fam-sheet f50-sheet k2-sheet-bg k2-sheet m43-modal nw-sheet sk76-drawer sk79-sheet sk82-sheet smbw-sheet tk-sheet-open tk-sheet wxp-sheet ub-sheet gb-sheet wx41-sheet k42-sheet b42-sheet p52-sheet orig-modal lg73-sheet sheet-bg sheet sb-sheet pp-sheet p16-sheet p21-sheet ch27-sheet k27-sheet
tom: 65 klassenavn (64 «rot»-varianter) i 37 filer. eks: empty blank dm-empty sq-empty sg-empty pk-none bd-empty ch-empty fam-empty pos-empty fam-none f50-empty k39-none k3-none mp-empty mp-none mu-tom nrk-tom m43-empty m70-empty c-none nw-empty nw73-empty trk-empty sk76-empty none sk79-empty smbw-empty rom-empty tk-empty tkha-none dg36-empty tw-none kg39-empty hl42-none dm43-gsc-empty lg44-none lg44-empty k46-empty f42-empty
laster: 19 klassenavn (19 «rot»-varianter) i 18 filer. eks: skeleton upd-spin ch70-spin spin mp-loading m43-skel m50-spin m70-skel smbw-spin rom-load gb-skel ns36-spin gb38-skel st44-spin pb44-skel skel m-spin mp2-spin p51-skel
toast: 28 klassenavn (28 «rot»-varianter) i 21 filer. eks: ac-toast bd-toast ch-toast fam-toast f50-toast k39-toast k2-toast kq-toast m43-toast nw73-toast trk-toast ub-toast upd-banner s44-toast lg44-toast st44-toast m45u-toast tk46-toast b42-toast toast so-banner m-toast upq-banner pp-toast ch27-toast p31-toast p44-toast p51-toast
feil: 48 klassenavn (47 «rot»-varianter) i 36 filer. eks: err upd-err bk-err ch70-err ci43-err k2-err k3-err k3-fa-err gate-err mp-err error sk79-err smbw-err trk-err ub-err ny-err gl-err gb-err km35-err onb37-err k38-err kg39-err hl40-err aa41-err hl41-err s44-err lg44-err pb44-err ga45-err m45u-err k46-err gp46-err b42-err err-msg s28-err mp2-err t22-err p27-err k27-err p34a-err
```
