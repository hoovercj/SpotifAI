import React from "react"
import { useDispatch, useSelector } from "react-redux"
import { Formik, Form, Field, ErrorMessage } from "formik"
import * as Yup from "yup"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog"
import { Button } from "@/Components/ui/button"
import { Input } from "@/Components/ui/input"
import { cn } from "@/lib/utils"
import { hideProfile, updateProfile } from "../store/userSlice"

const validationSchema = Yup.object().shape({
  name: Yup.string().required("First Name is required"),
})

export default function UserProfile() {
  const dispatch = useDispatch()
  const open = useSelector((s) => Boolean(s.user?.showProfile))
  const profile = useSelector((s) => s.user?.profile) || {}

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dispatch(hideProfile())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Lets the DJ address you by name on-air.
          </DialogDescription>
        </DialogHeader>

        <Formik
          initialValues={{ name: profile.name || "" }}
          enableReinitialize
          validationSchema={validationSchema}
          onSubmit={(values) => dispatch(updateProfile(values))}
        >
          {({ errors, touched, isSubmitting }) => (
            <Form className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">First name</span>
                <Field
                  as={Input}
                  name="name"
                  placeholder="Your first name"
                  className={cn(errors.name && touched.name && "border-destructive")}
                />
                <ErrorMessage
                  name="name"
                  component="span"
                  className="text-xs text-destructive"
                />
              </label>

              <DialogFooter className="mt-2 flex-row justify-end gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => dispatch(hideProfile())}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  Save
                </Button>
              </DialogFooter>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  )
}
