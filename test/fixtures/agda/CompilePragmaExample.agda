module CompilePragmaExample where

postulate
  ffiIdentity : Set → Set

{-# COMPILE GHC ffiIdentity = id #-}
