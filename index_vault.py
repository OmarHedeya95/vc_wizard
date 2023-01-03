from utils import load_dataset
from tqdm import tqdm
import sys 
import json
from utils import add_highlight, encode_query, get_tokens, load_bm25_index, save_json
from jina import Document, DocumentArray
n_dim = 1536  
ef_search = 50
max_connection = 16
ef_construction = 200


#files = sys.argv[1]   #json.loads(sys.argv[1])#sys.argv[1]
#
#vault_path = sys.argv[3]

vault_path = '/Users/omar/Library/Mobile Documents/iCloud~md~obsidian/Documents/Roaming Thoughts/'

plugin_path = vault_path + '.obsidian/plugins/vc_wizard'
data_path = plugin_path + '/vault_index/all_notes/'
bm25_index_filepath = plugin_path + '/BM25/bm25_index.json'
backup_path = plugin_path + '/backup'

json_path = sys.argv[1]  
key =  sys.argv[2]

da = load_dataset(data_path, metric='cosine', n_dim=n_dim, max_connection=max_connection, ef_search=ef_search)

bm25_index = load_bm25_index(bm25_index_filepath)



def average_chunks_embedding(total_note: Document, factor:int):
    #factor = 1 if name is embedded, otherwise zero to avoid extra division
    #note_embed = np.zeros_like(total_note.chunks[0].embedding)
    note_embed = total_note.embedding
    for chunk in total_note.chunks:
        note_embed+= chunk.embedding
    if len(total_note.chunks) > 0:
        #+1 because we also include name of the note
        note_embed/= (len(total_note.chunks) + factor)
    return note_embed

def get_highlight_with_embedded_notes(openai_key, highlight, notes_list, n_dim=4096, embedd_names=True, highlight_readwise=None):
    """You get the name of the note and the text included and return a Jina Document 
       which has text as file name and chunks (subdocuments) consisting of individual sentences in the note

    Args:
        highlight (str): the text inside a note
        notes_list (list): The sentences inside the note to be embedded
        n_dim (int, optional): the number of dimensions the text gets embedded into. Defaults to 4096 (cohere models)

    Returns:
        Document (Jina): _description_
    """
    #database = Document(text=highlight)
    #Encode the name of the note itself so it is added to the average
    #Todo should the name get a special weight to emphasize, demphasize it? -> scaling the vector would preserve meaning right? just change average
    
    database = encode_query(openai_key, highlight, n_dim=n_dim)
    if embedd_names:
        x = 1
    else:
        x = 0
    
    database.embedding = database.embedding * x

    children = DocumentArray(storage='annlite', config={
                             'n_dim': n_dim, 'metric': 'cosine'})
    sentences = notes_list
    print("-- Encoding Sentences --")
    for sentence in sentences:
        child = encode_query(openai_key, sentence, n_dim)
        child.parent_id = database.id
        children.append(child)

    database.chunks = children


    #todo The Embedding for the "Highlight or Note Title" should be average of sentences actually not its own!
    avg_note_embed = average_chunks_embedding(database, x)
    database.embedding = avg_note_embed

    if highlight_readwise:
        database.tags['alias'] = highlight_readwise
    
    return database

def index_vault(files: dict):
    print("--Embedding Files--")
    for file_name, value in tqdm(files.items()): #tqdm(files.items())
        file = value['full_path']
        is_modified = value['change_type']
        '''if is_modified == "D":
            #If target is just to delete a note from knowledge base
            note_name = extract_note_title(file)
            note = Document(text=note_name)
            print(f"Deleted file: {note.text}") 
            remove_old_note(da, note)
            #remove entity from index if it exists
            bm25_index.pop(note.text)
            #commit_file(file)
            continue'''
            
        try:
            notes_list, highlight, highlight_readwise = add_highlight(file)
        except Exception as e:
            print(f'Error at: {file}')
            print(e)
            continue
        if notes_list and highlight:
            # Create a document with the note title as text and all (embedded) sentences as chunks
            try:
                embedded_note = get_highlight_with_embedded_notes(key, highlight, notes_list, embedd_names=True, n_dim=n_dim, highlight_readwise=highlight_readwise)
            except Exception as e:
                print(f'Error at: {file}')
                print (e)
                continue
            
            tokens = get_tokens(embedded_note)
            note_name = embedded_note.text
            bm25_index[note_name] = {'id': embedded_note.id,'tokens': tokens}

        '''if is_modified == 'M':
            #If this is just a modified note, remove old one from database
            remove_old_note(da, embedded_note)'''

        
        print(f"Encoded file: {embedded_note.text}")
        with da:
            da.append(embedded_note)
    
    if files:
        print('Some changes happened in the vault since last index')
        save_json(bm25_index_filepath, bm25_index)
        with da:
            da.save(backup_path + '/backup.db')
    
    return da


files = []
with open(json_path, 'r') as f:
    files = json.load(f)


index_vault(files)