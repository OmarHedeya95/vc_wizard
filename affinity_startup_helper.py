import sys
import re
import requests
import json
from requests.auth import HTTPBasicAuth
from affinity import get_startup_by_name, add_notes_to_company

startup_name = sys.argv[1]
note = sys.argv[2]
affinity_key = sys.argv[3]
owner_person_value = int(sys.argv[4])

affinity_auth =  HTTPBasicAuth(
    '', affinity_key)






startup_name = re.sub(r'[^A-Za-z0-9\s.]', '', startup_name)
startup_name = startup_name.strip()
#note = re.sub(r'[^A-Za-z0-9-# \s]', '', note)
note = re.sub(r'^(==|\*\*|#{2,})$', '', note)


startup = get_startup_by_name(owner_person_value, startup_name, affinity_auth)

if startup:
    response = add_notes_to_company(startup, note, affinity_auth)
    if response.status_code == 200:
        print("Successful!")
    else:
        print("Error!")
else:
    print("Startup not found!")



