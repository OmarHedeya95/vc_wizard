import requests
from pprint import pprint
from requests.auth import HTTPBasicAuth
import json
import sys
import re

url_affinity_organizations = "https://api.affinity.co/organizations"
url_affinity_list = "https://api.affinity.co/lists"
url_affinity_note = "https://api.affinity.co/notes"
url_affinity_persons = "https://api.affinity.co/persons"
url_affinity_field_values = "https://api.affinity.co/field-values"
url_affinity_note = "https://api.affinity.co/notes"
headers = {'Content-Type': 'application/json'}


def get_person(first_name: str, last_name: str, affinity_auth):
    next_token = None

    while True:
        r = requests.get(url_affinity_persons, auth=affinity_auth, headers=headers, params={'term': last_name, 'page_token': next_token}) # 'page_size': 5 -> for debugging
        response = r.json()

        people = response['persons']
        next_token = response['next_page_token']

        for person in people:
            if person['first_name'] == first_name and person['last_name'] == last_name:
                return person

        if not next_token or next_token == 'null':
            break
        
    

    return None

def get_person_details(person_id: str, affinity_auth):
    r = requests.get(url_affinity_persons+ '/' + str(person_id), auth=affinity_auth, headers=headers)
    response = r.json()
    return response

def is_person_in_venture_network(venture_network_list_id: str, person_details: dict):
    list_entries = person_details['list_entries']

    for entry in list_entries:
        if str(entry['list_id']) == venture_network_list_id:
            return True, entry['id']
    
    return False, None

def get_field_values(type_id: str , id: str, affinity_auth):
    # Can be either person or organization or opportunity or list_entry_id
    r = requests.get(url_affinity_field_values, params={type_id: id}, auth=affinity_auth, headers=headers)
    response = r.json()
    return response

def add_field_value(field_id: int, entity_id: int, value, affinity_auth, list_entry_id=None):
    #We use list_entry_id only if the field to be updated is related to a specific list
    r = requests.post(url_affinity_field_values, data=json.dumps({'field_id': field_id, 'entity_id': entity_id, 'value': value, 'list_entry_id': list_entry_id}), auth=affinity_auth, headers=headers)
    return r.json()

def add_entry_to_list(list_id: str, entity_id: int, affinity_auth):
    # Define the list you want to add an entry to
    r = requests.post(url_affinity_list + '/' + list_id + '/list-entries', data=json.dumps({'entity_id': entity_id}), auth=affinity_auth, headers=headers)
    return r.json()

def add_notes_to_person(person_id, notes, affinity_auth):
    r = requests.post(url_affinity_note, auth=affinity_auth,
                      headers=headers, data=json.dumps({"person_ids": [person_id], "content": notes}))
    return r.json()

def add_notes_to_company(company, notes, affinity_auth):
    # Given company in the format from affinity organization
    r = requests.post(url_affinity_note, auth=affinity_auth,
                      headers=headers, data=json.dumps({"organization_ids": [company['id']], "content": notes}))

    return r

def get_startup_by_name(owner_person_value: int, startup_name: str, affinity_auth):
    # Returns a startup with the given name if I had an interaction with it
    next_token = None
    while True:
        r = requests.get(url_affinity_organizations, auth=affinity_auth,
                        headers=headers, params={"term": startup_name, 'with_interaction_dates': True, 'with_interaction_persons': True, 'page_token': next_token})
        organizations = r.json()
        for organization in organizations['organizations']:
            for interaction_name, interaction_data in dict(organization['interactions']).items():
                if interaction_data:
                    people_involved = dict(interaction_data).get('person_ids', [0])
                    if owner_person_value in people_involved:
                        #pprint(organization)
                        return organization
                else:
                    break

        next_token = organizations['next_page_token']
        if not next_token:
            return None








