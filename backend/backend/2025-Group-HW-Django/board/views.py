import json
from django.http import HttpRequest, HttpResponse

from board.models import Board, User
from utils.utils_request import BAD_METHOD, request_failed, request_success, return_field
from utils.utils_require import MAX_CHAR_LENGTH, CheckRequire, require
from utils.utils_time import get_timestamp
from utils.utils_jwt import generate_jwt_token, check_jwt_token


@CheckRequire
def startup(req: HttpRequest):
    return HttpResponse("Congratulations! You have successfully installed the requirements. Go ahead!")


@CheckRequire
def login(req: HttpRequest):
    if req.method != "POST":
        return BAD_METHOD
    
    # Request body example: {"userName": "Ashitemaru", "password": "123456"}
    body = json.loads(req.body.decode("utf-8"))
    
    username = require(body, "userName", "string", err_msg="Missing or error type of [userName]")
    password = require(body, "password", "string", err_msg="Missing or error type of [password]")
    
    # TODO Start: [Student] Finish the login function according to the comments below
    # If the user does not exist, create a new user and save; while if the user exists, check the password
    # If new user or checking success, return code 0, "Succeed", with {"token": generate_jwt_token(user_name)}
    # Else return request_failed with code 2, "Wrong password", http status code 401

    try:
        res = User.objects.filter(name=username).first()
        if res is None:
            res = User.objects.create(name=username, password=password)
        elif res.password != password:
            return request_failed(2, "Wrong password", 401)
        return request_success({"token" : generate_jwt_token(username)})
    except Exception as e:
        return request_failed(-4, f'{e}', 500)
    
    # TODO End: [Student] Finish the login function according to the comments above


def check_for_board_data(body):
    board = require(body, "board", "string", err_msg="Missing or error type of [board]")
    # TODO Start: [Student] add checks for type of boardName and userName
    board_name = require(body, "boardName", "string", err_msg="Missing or error type of [boardName]")
    user_name = require(body, "userName", "string", err_msg="Missing or error type of [userName]")
    # TODO End: [Student] add checks for type of boardName and userName
    
    assert 0 < len(board_name) <= 50, "Bad length of [boardName]"
    
    # TODO Start: [Student] add checks for length of userName and board
    assert 0 < len(user_name) <= 50, "Bad length of [userName]"
    assert len(board) == 2500, "Bad length of [board]"
    assert set(board) <= {'0', '1'}, "Invalid char in [board]"
    # TODO End: [Student] add checks for length of userName and board
    
    
    # TODO Start: [Student] add more checks (you should read API docs carefully)
    
    # TODO End: [Student] add more checks (you should read API docs carefully)
    
    return board, board_name, user_name


@CheckRequire
def boards(req: HttpRequest):
    if req.method == "GET":
        params = req.GET
        boards = Board.objects.all().order_by('-created_time')
        return_data = {
            "boards": [
                # Only provide required fields to lower the latency of
                # transmitting LARGE packets through unstable network
                return_field(board.serialize(), ["id", "boardName", "createdAt", "userName"]) 
            for board in boards],
        }
        return request_success(return_data)
        
    
    elif req.method == "POST":
        jwt_token = req.headers.get("Authorization")
        body = json.loads(req.body.decode("utf-8"))
        
        # TODO Start: [Student] Finish the board view function according to the comments below
        
        # First check jwt_token. If not exists, return code 2, "Invalid or expired JWT", http status code 401
        
        if jwt_token is None:
            return request_failed(2, "Invalid or expired JWT", 401)

        # Then invoke `check_for_board_data` to check the body data and get the board_state, board_name and user_name. Check the user_name with the username in jwt_token_payload. If not match, return code 3, "Permission denied", http status code 403
        
        try:
            board_state, board_name, user_name = check_for_board_data(body)
        except Exception as e:
            return request_failed(-2, f'{e}', 400)

        res = check_jwt_token(jwt_token)
        if res is None:
            return request_failed(2, "Invalid or expired JWT", 401)
        if res['username'] != user_name:
            return request_failed(3, "Permission denied", 403)

        # Find the corresponding user instance by user_name. We can assure that the user exists.
        
        try:

            user = User.objects.get(name=user_name)

            # We lookup if the board with the same name and the same user exists.
            ## If not exists, new an instance of Board type, then save it to the database.
            ## If exists, change corresponding value of current `board`, then save it to the database.
            
            board = Board.objects.filter(user=user, board_name=board_name).first()

            if board is None:
                board = Board(user=user, board_state=board_state, board_name=board_name)
                isCreate = True
            else:
                board.board_state = board_state
                board.created_time = get_timestamp()
                isCreate = False
            
            board.save()

            return request_success({"isCreate" : isCreate})

        except Exception as e:
            return request_failed(-4, f'{e}', 500)
        
        # TODO End: [Student] Finish the board view function according to the comments above
        
    else:
        return BAD_METHOD


@CheckRequire
def boards_index(req: HttpRequest, index: any):
    
    idx = require({"index": index}, "index", "int", err_msg="Bad param [id]", err_code=-1)
    assert idx >= 0, "Bad param [id]"
    
    if req.method == "GET":
        params = req.GET
        board = Board.objects.filter(id=idx).first()  # Return None if not exists
        
        if board:
            return request_success(
                return_field(board.serialize(), ["board", "boardName", "userName"])
            )
            
        else:
            return request_failed(1, "Board not found", status_code=404)
    
    elif req.method == "DELETE":
        # TODO Start: [Student] Finish the board_index view function
        try:
            jwt_token = req.headers.get("Authorization")
            
            if jwt_token is None:
                return request_failed(2, "Invalid or expired JWT", 401)

            res = check_jwt_token(jwt_token)
            if res is None:
                return request_failed(2, "Invalid or expired JWT", 401)

            board = Board.objects.filter(id=idx).first()

            if board is None:
                return request_failed(1, "Board not found", 404)
            
            if board.user.name != res['username']:
                return request_failed(3, "Cannot delete board of other users", 403)
            
            board.delete()

            return request_success()
        except Exception as e:
            return request_failed(-4, f'{e}', 500)

        # TODO End: [Student] Finish the board_index view function
    
    else:
        return BAD_METHOD


# TODO Start: [Student] Finish view function for user_board

@CheckRequire
def user_board(req: HttpRequest, userName: any):

    if req.method != "GET":
        return BAD_METHOD

    user_name = require({"userName": userName}, "userName", "string", err_msg="Bad param [userName]", err_code=-1)
    assert 0 < len(user_name) <= 50, "Bad param [userName]"

    try:

        user = User.objects.filter(name=user_name).first()

        if user is None:
            return request_failed(1, "User not found", 404)
        
        boards = Board.objects.filter(user=user)

        return request_success({
            "userName" : user_name,
            "boards" : [
                {
                    "id" : board.id,
                    "boardName" : board.board_name,
                    "createdAt" : board.created_time,
                    "userName" : user_name
                } for board in boards
            ]
        })

    except Exception as e:
        return request_failed(-4, f'{e}', 500)


# TODO End: [Student] Finish view function for user_board
