#!/usr/bin/env python3
"""
Tek seferlik script: players.json icindeki Ingilizce/aksansiz alanlari
Turkce/dogru aksanli karsiliklarina cevirir.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "seed"
SRC = ROOT / "players.json"

COUNTRY_TR = {
    "Argentina": "Arjantin",
    "Brazil": "Brezilya",
    "Spain": "İspanya",
    "Ispanya": "İspanya",
    "Portugal": "Portekiz",
    "France": "Fransa",
    "Germany": "Almanya",
    "Italy": "İtalya",
    "England": "İngiltere",
    "Netherlands": "Hollanda",
    "Belgium": "Belçika",
    "Belcika": "Belçika",
    "Russia": "Rusya",
    "Japan": "Japonya",
    "Saudi Arabia": "Suudi Arabistan",
    "United States": "ABD",
    "Turkey": "Türkiye",
    "Turkiye": "Türkiye",
    "Cameroon": "Kamerun",
    "Croatia": "Hırvatistan",
    "Hirvatistan": "Hırvatistan",
    "Egypt": "Mısır",
    "Misir": "Mısır",
    "Norway": "Norveç",
    "Norvec": "Norveç",
    "Poland": "Polonya",
    "Georgia": "Gürcistan",
    "Gurcistan": "Gürcistan",
    "Ivory Coast": "Fildişi Sahili",
    "Fildisi Sahili": "Fildişi Sahili",
    "Colombia": "Kolombiya",
}

CITY_TR = {
    "Istanbul": "İstanbul",
    "Karamursel": "Karamürsel",
    "Mostoles": "Móstoles",
    "Marseille": "Marsilya",
    "Munich": "Münih",
    "Milan": "Milano",
    "Lisbon": "Lizbon",
    "Rome": "Roma",
    "Turin": "Torino",
    "Naples": "Napoli",
    "London": "Londra",
    "Funchal": "Funchal",
    "Nkon": "Nkon",
    "Basyoun": "Başyun",
    "Mexico City": "Meksika",
}

# slug -> displayName ve name duzeltmeleri
NAME_FIXES = {
    "samuel-etoo": {"displayName": "Eto'o", "name": "Samuel Eto'o Fils"},
    "hakan-sukur": {"displayName": "Hakan Şükür", "name": "Hakan Şükür"},
    "emre-belozoglu": {"displayName": "Emre Belözoğlu", "name": "Emre Belözoğlu"},
    "kerem-akturkoglu": {"displayName": "Kerem Aktürkoğlu", "name": "Kerem Aktürkoğlu"},
    "hakan-calhanoglu": {"displayName": "Çalhanoğlu", "name": "Hakan Çalhanoğlu"},
    "kenan-yildiz": {"displayName": "Kenan Yıldız", "name": "Kenan Yıldız"},
    "arda-guler": {"displayName": "Arda Güler", "name": "Arda Güler"},
    "orkun-kokcu": {"displayName": "Kökçü", "name": "Orkun Kökçü"},
    "merih-demiral": {"displayName": "Demiral", "name": "Merih Demiral"},
    "ugurcan-cakir": {"displayName": "Uğurcan", "name": "Uğurcan Çakır"},
    "mesut-ozil": {"displayName": "Mesut Özil", "name": "Mesut Özil"},
    "tugay-kerimoglu": {"displayName": "Tugay", "name": "Tugay Kerimoğlu"},
    "ozan-tufan": {"displayName": "Ozan Tufan", "name": "Ozan Tufan"},
    "andres-iniesta": {"displayName": "Iniesta", "name": "Andrés Iniesta Luján"},
    "kylian-mbappe": {"displayName": "Mbappé", "name": "Kylian Mbappé Lottin"},
    "andrea-pirlo": {"displayName": "Pirlo", "name": "Andrea Pirlo"},
    "didier-drogba": {"displayName": "Drogba", "name": "Didier Yves Drogba Tébily"},
    "pele": {"displayName": "Pelé", "name": "Edson Arantes do Nascimento"},
    "xavi-hernandez": {"displayName": "Xavi", "name": "Xavier Hernández Creus"},
    "iker-casillas": {"displayName": "Casillas", "name": "Iker Casillas Fernández"},
    "kaka": {"displayName": "Kaká", "name": "Ricardo Izecson dos Santos Leite"},
    "juan-roman-riquelme": {"displayName": "Riquelme", "name": "Juan Román Riquelme"},
    "sergio-aguero": {"displayName": "Agüero", "name": "Sergio Leonel Agüero"},
    "lionel-messi": {"displayName": "Messi", "name": "Lionel Andrés Messi"},
    "karim-benzema": {"displayName": "Benzema", "name": "Karim Mostafa Benzema"},
    "alex-de-souza": {"displayName": "Alex", "name": "Alex de Souza"},
}


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    changed = 0
    for p in data:
        slug = p.get("slug")
        # countries
        bc = p.get("birthCountry")
        if bc in COUNTRY_TR:
            p["birthCountry"] = COUNTRY_TR[bc]
            changed += 1
        nat = p.get("nationality")
        if nat in COUNTRY_TR:
            p["nationality"] = COUNTRY_TR[nat]
            changed += 1
        # cities
        bcity = p.get("birthCity")
        if bcity in CITY_TR:
            p["birthCity"] = CITY_TR[bcity]
            changed += 1
        # names
        if slug in NAME_FIXES:
            fix = NAME_FIXES[slug]
            p["displayName"] = fix["displayName"]
            p["name"] = fix["name"]
            changed += 1

    SRC.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {changed} field(s) across {len(data)} players")


if __name__ == "__main__":
    main()
