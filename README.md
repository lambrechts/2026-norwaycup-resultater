# Norway Cup-resultater 2026

Repoet henter kamper og resultater for fem Varegg/Sandviken-lag fra Norway Cup hvert femte minutt. Dataene lagres i [`data/results.csv`](data/results.csv).

GitHub Actions-jobben kan også startes manuelt fra **Actions → Hent Norway Cup-resultater → Run workflow**. Lokalt kan samme jobb kjøres uten ekstra avhengigheter:

```sh
python3 fetch_results.py
```

Jobben committer bare når innholdet i CSV-filen har endret seg.
