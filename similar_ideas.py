import openai
import sys
import numpy as np
from jina import Document, DocumentArray
from utils import load_dataset, encode_query

#'/Users/omar/Library/Mobile Documents/iCloud~md~obsidian/Documents/Roaming Thoughts/.obsidian/plugins/vc_wizard/'
#data_path = + #'/Users/omar/Library/Mobile Documents/iCloud~md~obsidian/Documents/Roaming Thoughts/.obsidian/plugins/vc_wizard' + '/vault_index/obsidian_vault_index_small_embedd_name_openai'

n_dim = 1536 
ef_search = 50
max_connection = 16 
ef_construction = 200

text = sys.argv[1]
key =  sys.argv[2]
vault_path = sys.argv[3]
openai.api_key = key
plugin_path = vault_path + '.obsidian/plugins/vc_wizard/'
data_path = plugin_path + 'vault_index/all_notes'   #obsidian_vault_index_small_embedd_name_openai'
#print('Data path: ' + data_path)


def get_similar_sentences(da: DocumentArray, sentence:Document, n_dim, metric='cosine'):
    sentence.match(da['@c'][...], metric=metric, limit=3, exclude_self=True)
    for match in sentence.matches:
        print(f'{match.text}')
        scores = match.scores['cosine']
        print(f'{scores}\n')
        note_title = da[match.parent_id].text
        print(f'Note title: {note_title}')



print("Loading dataset...")

da = load_dataset(data_path, metric='cosine', n_dim=n_dim, max_connection=max_connection, ef_search=ef_search)

print("dataset loaded")

sentence = text #'The team and I had this typical engineering view that you should build an "amazing" product then go out to the world with a "bang"'

encoded_sentence = encode_query(key,sentence, n_dim=n_dim)

print("Encoding done!")

get_similar_sentences(da, encoded_sentence, n_dim)