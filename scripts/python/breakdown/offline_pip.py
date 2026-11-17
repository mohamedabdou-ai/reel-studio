"""Run the existing pip with outbound socket access disabled. Never installs itself."""
import runpy
import socket
import sys


def deny_network(*_args, **_kwargs):
    raise OSError('Network disabled for the verified local-wheel operation')


class OfflineSocket(socket.socket):
    connect = deny_network
    connect_ex = deny_network


def main():
    socket.socket = OfflineSocket
    socket.create_connection = deny_network
    socket.getaddrinfo = deny_network
    sys.argv = ['pip', *sys.argv[1:]]
    runpy.run_module('pip', run_name='__main__')


if __name__ == '__main__':
    main()
