"""Application config"""
import os

PWD = os.path.abspath(os.curdir)
SECRET_KEY = "8dd09dcb561d308eca351346b8f5a37c6ff33dc39d41154e82b9c4ccc6fde33b691be96ef24692be"

DB_NAME = "truthiness.db"
NETWORK = b'\x6f'
SQLALCHEMY_DATABASE_URI = 'sqlite:///{}/{}'.format(PWD, DB_NAME)
