# Norway Cup-resultater 2026

Repoet henter kamper og resultater for fem Varegg/Sandviken-lag fra Norway Cup hvert femte minutt. Dataene lagres i [`data/results.csv`](data/results.csv).

GitHub Actions-jobben kan også startes manuelt fra **Actions → Hent Norway Cup-resultater → Run workflow**. Lokalt kan samme jobb kjøres uten ekstra avhengigheter:

```sh
python3 fetch_results.py
```

Jobben committer bare når innholdet i CSV-filen har endret seg.

## Resultatside

`index.html` viser kampene som en mobilvennlig oversikt og leser den publiserte CSV-filen direkte fra GitHub. Workflowen **Publiser resultatsiden** publiserer siden til GitHub Pages ved endringer på `main`.
