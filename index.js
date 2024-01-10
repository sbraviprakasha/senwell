var AWS = require('aws-sdk');
const uuid = require('uuid');
AWS.config.update({ region: 'ap-southeast-1' });
var ddb = new AWS.DynamoDB.DocumentClient();
var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
const senwell_user_pool_id = "ap-southeast-1_7dxK3DNX3";

const insert_into_dynamo = async (params) => {
  try {
    await ddb.put(params).promise();
    return "SUCCESS";
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const update_dynamo = async (params) => {
  try {
    await ddb.update(params).promise();
    return "SUCCESS";
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const delete_dynamo = async (params) => {
  try {
    await ddb.delete(params).promise();
    return "SUCCESS";
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const query_dynamo = async (params) => {
  try {
    let data = await ddb.query(params).promise();
    return data;
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const scan_dynamo = async (params) => {
  try {
    let data = await ddb.scan(params).promise();
    return data;
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const check_empty_field = (event) => {
  let checkEmptyFields = true;
  for (const field in event) {
    if (typeof event[field] == 'string') {
      if (event[field].length == 0) {
        checkEmptyFields = false;
      }
      else {
        event[field] = event[field].trim();
      }
    }
    else if (Array.isArray(field) && event[field].length == 0) {
      checkEmptyFields = false;
    }
  }
  if (checkEmptyFields) {
    return true;
  }
  else {
    return false;
  }
};

const create_cognito_user = async (email_id, poolId, resendInvitation, temporary_password = (+Date.now()).toString(32)) => {
  try {
    var params = {
      UserPoolId: poolId,
      Username: email_id.trim().toLowerCase(),
      UserAttributes: [{
          Name: 'email',
          Value: email_id.trim().toLowerCase()
        },
        {
          Name: 'email_verified',
          Value: 'true'
        }
      ],
      TemporaryPassword: temporary_password
    };
    if (resendInvitation) {
      params.MessageAction = 'RESEND';
    }
    await cognitoidentityserviceprovider.adminCreateUser(params).promise();
    return 'Success';
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const check_cognito_user = async (email_id, poolId) => {
  try {
    let checkCognitoUserPresentOrNot = {
      UserPoolId: poolId,
      Username: email_id.trim(),
    };
    await cognitoidentityserviceprovider.adminGetUser(checkCognitoUserPresentOrNot).promise();
    return false;
  }
  catch (e) {
    return true;
  }
};

const deleteCognitoUser = async (email_id, poolId) => {
  try {
    var params = {
      UserPoolId: poolId,
      Username: email_id.trim().toLowerCase()
    };
    await cognitoidentityserviceprovider.adminDeleteUser(params).promise();
    return 'Success';
  }
  catch (err) {
    console.log(params, err);
    throw new Error(err);
  }
};

const sign_up_user = async (event) => {
  if (check_empty_field) {
    let checkIfUserExistsParams = {
      TableName: "senwell_solutions",
      IndexName: "user_email_id-index",
      KeyConditionExpression: "user_email_id = :user_email_id",
      ExpressionAttributeValues: {
        ':user_email_id': event.user_email_id
      }
    };
    let user = await query_dynamo(checkIfUserExistsParams);
    if (user.Count == 0) {
      let check_user = await check_cognito_user(event.user_email_id, senwell_user_pool_id);
      if (check_user) {
        let newUserParams = {
          TableName: "senwell_solutions",
          Item: {
            employee_id: uuid.v4(),
            first_name: event.first_name,
            last_name: event.last_name,
            user_email_id: event.user_email_id,
            department: event.department,
            Address: event.Address,
            dob: event.dob,
            salary: event.salary
          }
        };
        let user = await insert_into_dynamo(newUserParams);
        if (user == "SUCCESS") {
          await create_cognito_user(event.user_email_id, senwell_user_pool_id, false);
          return {
            status: "sucess",
            stastus_message: "user sign-up succesfully!!"
          };
        }
        else {
          throw new Error("something went Wrong please try again!");
        }
      }
      else {
        throw new Error("User Already Exists!");
      }
    }
    else {
      throw new Error("user Already exists!!");
    }
  }
  else {
    throw new Error('Empty field ocuured user can not sign up!!');
  }
};

const update_user = async (event) => {
  if (check_empty_field) {
    let checkUserExistsParams = {
      TableName: "senwell_solutions",
      KeyConditionExpression: "employee_id = :employee_id",
      ExpressionAttributeValues: {
        ':employee_id': event.employee_id
      }
    };
    let user_details = await query_dynamo(checkUserExistsParams);
    if (user_details.Count > 0) {
      let UpdateExpression = 'set'
      let ExpressionAttributeNames = {};
      let ExpressionAttributeValues = {};
      for (const field in event) {
        if (field == "first_name" || field == "last_name" || field == "department" || field == "Address" || field == "dob" || field == "salary") {
          UpdateExpression += ` #${field} = :${field} ,`;
          ExpressionAttributeNames['#' + field] = field;
          ExpressionAttributeValues[':' + field] = event[field];
        }
      }
      if (UpdateExpression != "set ") {
        UpdateExpression = UpdateExpression.slice(0, -1);
        let updateUserDetailsParams = {
          TableName: 'senwell_solutions',
          Key: {
            employee_id: user_details.Items[0].employee_id
          },
          UpdateExpression: UpdateExpression,
          ExpressionAttributeNames: ExpressionAttributeNames,
          ExpressionAttributeValues: ExpressionAttributeValues,
          ReturnValues: 'UPDATED_NEW'
        };
        await update_dynamo(updateUserDetailsParams);
        return {
          status: "SUCCESS",
          status_message: "Successfully Updated the User details!"
        };
      }
    }
    else {
      throw new Error('Oopps!! User Not Found! with this employee_id id :' + event.employee_id + ' Please enter a valid employee id!!');
    }
  }
  else {
    throw new Error("Emapty field occured can't update any user data!");
  }
};

const delete_user = async (event) => {
  if (check_empty_field) {
    let checkIfUserExistsParams = {
      TableName: "senwell_solutions",
      KeyConditionExpression: "employee_id = :employee_id",
      ExpressionAttributeValues: {
        ':employee_id': event.employee_id
      }
    };
    let user_details = await query_dynamo(checkIfUserExistsParams);
    if (user_details.Count > 0) {
      let deleteUserParams = {
        TableName: "senwell_solutions",
        Key: {
          employee_id: event.employee_id
        },
      };
      await delete_dynamo(deleteUserParams);
      await deleteCognitoUser(event.user_email_id, senwell_user_pool_id);
      return {
        status: "Success",
        status_message: "successfully deleted the user!"
      };
    }
    else {
      throw new Error('User Not Found of this employee ID ' + event.employee_id);
    }
  }
  else {
    throw new Error('Empty field Occured can not delete any User!!');
  }
};

const get_current_users = async (event) => {
  let getCurrentUsersParams = {
    TableName: "senwell_solutions",
    ProjectionExpression: "employee_id,user_email_id,first_name,salary"
  };
  let currentUsers = await scan_dynamo(getCurrentUsersParams);
  currentUsers.Items.sort((a, b) => a.salary - b.salary);
  return currentUsers.Items;
};

exports.handler = async (event) => {
  console.log(JSON.stringify(event));
  switch (event.command) {
    case "signUpUser":
      return await sign_up_user(event);
    case 'deleteUser':
      return await delete_user(event);
    case "updateUser":
      return await update_user(event);
    case "getCurrentUsers":
      return await get_current_users(event);
    default:
      throw new Error("command Not Found!");
  }
};
