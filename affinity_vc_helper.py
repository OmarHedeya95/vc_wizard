
import sys
import re
from requests.auth import HTTPBasicAuth
from affinity import get_person, get_person_details, is_person_in_venture_network, get_field_values, add_entry_to_list, add_field_value, add_notes_to_person


person_name = sys.argv[1]
note = sys.argv[2]
affinity_key = sys.argv[3]
owner_person_value = int(sys.argv[4])
connection_owner_field_id = int(sys.argv[5])
venture_network_list_id = sys.argv[6]

print(owner_person_value)
print(connection_owner_field_id)


person_name = re.sub(r'[^A-Za-z0-9\s]', '', person_name)
person_name = person_name.strip()
affinity_auth =  HTTPBasicAuth(
    '', affinity_key)



names = person_name.split()

print(names)

if len(names) > 1:
    person = get_person(names[0], names[1], affinity_auth)
else:
    person = None

if not person:
    # If we do not find the person, send back some text to Javascript to notify me or something
    #! Maybe something on the cloud for this?
    print("Oops! Person was not found!")
    pass

else:
    #pprint(person)
    person_id = person['id']
    person_details = get_person_details(person_id, affinity_auth)
    person_is_registered, list_entry_id = is_person_in_venture_network(venture_network_list_id, person_details)
    print(venture_network_list_id)
    print(person_is_registered)
    if person_is_registered:        
        person_venture_network_fields = get_field_values('list_entry_id', list_entry_id, affinity_auth)
        
    else:
        # Add person to venture network
        add_entry_to_list(venture_network_list_id, person_id, affinity_auth)
        person_details = get_person_details(person_id, affinity_auth)
        _, list_entry_id = is_person_in_venture_network(venture_network_list_id, person_details)

    #add Omar as owner of the connection with the person
    add_field_value(connection_owner_field_id, person_id, owner_person_value, affinity_auth=affinity_auth, list_entry_id = list_entry_id)     


    #Add Notes
    print(add_notes_to_person(person_id, note, affinity_auth))