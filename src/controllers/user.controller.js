import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import { deleteTemporaryFile } from "../utils/deleteTemporaryFile.js";


const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave:false})

        return {accessToken,refreshToken}

    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating refresh and access token")
    }
}


const registerUser = asyncHandler(async (req,res) => {
    // get user details from frontend
    // validation -not empty
    // check if user already exist:username,email
    // check  for images ,check for avatar
    // upload them to cloudinary,avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response

   const {fullname,email,username,password} = req.body
    console.log("email: ",email)

    if (
        [fullname, email, username, password].some((field) => 
        field?.trim()=== "")
    ) {
        throw new ApiError(400,"All fields are required")
    }

   const existedUser = await  User.findOne({
        $or:[{ username }, { email }]
    })

    if(existedUser){
        throw new ApiError(409, "User with email or username already exist")
    }


   const avatarLocalPath = req.files?.avatar[0]?.path;

   

   //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) 
        && req.files.coverImage.length>0){
            
            coverImageLocalPath = req.files.coverImage[0].path
            
        }


   if (!avatarLocalPath) {
    throw new ApiError(400,"Avatar file is required")
   }

   const avatar = await uploadOnCloudinary(avatarLocalPath)
   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   if (!avatar) {
    throw new ApiError(400,"Avatar file is required")
   }

   const user = await User.create({
    fullname,
    password,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    email,
    username:username.toLowerCase()
   })

   const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
   )

   if (!createdUser) {
    throw new ApiError(500,"something went wrong while registering the user")
   }

   return res.status(201).json(
    new ApiResponse(200,createdUser,"User registered successfully")
   )

})


const loginUser = asyncHandler(async (req,res) => {
    //req body take data
    //username or email
    //find the user
    // password check
    //access and refresh token 
    // send cookies

    const  {email,username,password} = req.body

    if (!username && !email) {
        throw new ApiError(400,"username or email is required")
    }

    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if (!user) {
        throw new ApiError(404,"user doest not exist")
    }

    const isPasswordvalid = await user.isPasswordCorrect(password)

    if (!isPasswordvalid) {
        throw new ApiError(401,"Invalid user Credentials")
    }


    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

   const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
   )

   const options = {
    httpOnly: true,
    secure:true
   }

    return res.status(200).cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser , accessToken, refreshToken
            },
            "User Logged in successfully"
        )
    )

})


const logoutUser = asyncHandler(async (req,res) => {
   await User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {
                refreshToken: undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly: true,
        secure:true
       }

    return res.status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(
        new ApiResponse(200, {} ,"User logged out")
    )
})


const refreshAccessToken = asyncHandler(async (req,res) => {
   const incomingRefreshToken =  req.cookie.refreshToken || req.body.refreshToken

   if(!incomingRefreshToken) {
    throw new ApiError(401,"unauthorized request")
   }

  try {
    const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
  
     const user = await User.findById(decodedToken?._id)
  
     if (!user) {
      throw new ApiError(401,"Invalid refresh token")
     }
  
     if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401,"Refresh token is expired or used")
     }
  
      const options = {
          httpOnly:true,
          secure:true
      }
  
      const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)
  
      return res
      .status(200)
      .cookie("accessToken",accessToken,options)
      ,cookie("refreshToken",refreshToken,options)
      .json(
          new ApiResponse(
              200,
              {accessToken,refreshToken},
              "Access token refreshed"
          )
      )
  } catch (error) {
    throw new ApiError(401,error?.message || "invalid refresh token")
  }
})


const changeCurrentPassword = asyncHandler(async (req,res) =>{
    const {oldPassword,newPassword} = req.body
   const user = await User.findById(req.user?._id)
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

   if(!isPasswordCorrect){
    throw new ApiError(400,"Invalid Old password")
   }

   user.password=newPassword

   await user.save({validateBeforeSave:false})

   return res.status(200,json(new ApiResponse(200, {},"password changed successfully")))

})


const getCurrentUser = asyncHandler(async(req,res)=>{
    return res.status(200).json(new ApiResponse(200,req.user,"current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullname,email} = req.body

     if(!(fullname || email)){
        throw new ApiError(400,"All fields are required")
     }
     const user = User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                fullname,
                email
            }
        },
        {new :true}
     ).select("-password")

     return res.status(200).json(new ApiResponse(200,user,"Account details updated"))
})


const updateUserAvatar = asyncHandler(async(req,res)=>{
   const avatarLocalPath =  req.file?.path
   if (!avatarLocalPath) {
    throw new ApiError(400,"Avatar file is missing")
   }

   const avatar = await uploadOnCloudinary(avatarLocalPath)

   const filedeleteResponse = deleteTemporaryFile(avatarLocalPath)
   if(!filedeleteResponse){
    console.log("not deleted")
   }
   else{
    console.log("deleted")
   }

   if (!avatar.url) {
    throw new ApiError(400,"Error while uploading on avatar")
   }

   const user = User.findByIdAndUpdate(req.user?._id,
    {
        $set:{
            avatar:avatar.url
        }
    },
    {new:true}
   ).select("-password")


   res.status(200).json(
    new ApiResponse(200,user,"avatar image updated successfully")
)
})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath =  req.file?.path
    if (!coverImageLocalPath) {
     throw new ApiError(400,"cover image file is missing")
    }
 
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
 
    if (!coverImage) {
     throw new ApiError(400,"Error while uploading on avatar")
    }
 
    const user = User.findByIdAndUpdate(req.user?._id,
     {
         $set:{
            coverImage:coverImage.url
         }
     },
     {new:true}
    ).select("-password")

    res.status(200).json(
        new ApiResponse(200,user,"cover image updated successfully")
    )
 })



const getUserChannelProfile = asyncHandler(async (req,res) => {

    const {username} = req.params

    if (!username?.trim()) {
        throw new ApiError(400,"username is missing")
    }
    const channel = await User.aggregate( [
        {
            $match:{
                username:username?.toLowerCase()
            }
            
        },
        {
            $lookup:{
                from : subscriptions,
                localField:"_id",
                foreignField: "channel",
                as:"subscribers"
            }
        },{
            $lookup:{
                from:subscriptions,
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },{
            $addFields:{
                subsrcibersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in: [req?._id,"subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullname:1,
                username:1,
                subsrcibersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ] )

    if (!channel?.length) {
        throw new ApiError(404,"channel doesnt exist")
    }
    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
    )
})


const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user._id)
            }
        },{
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullname:1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },{
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        },
       
    ])


    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "watch History fetched successfully"
        )
    )
})






export {registerUser,loginUser,logoutUser,
    refreshAccessToken,changeCurrentPassword,
    getCurrentUser,updateAccountDetails,
    updateUserAvatar,updateUserCoverImage,
    generateAccessAndRefreshToken,getUserChannelProfile
,   getWatchHistory}



 